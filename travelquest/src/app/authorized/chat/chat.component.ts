import { Component, OnInit } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  collectionData,
  query,
  where,
  getDocs,
  updateDoc,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';
import { from, map, Observable, switchMap } from 'rxjs';
import { sessionStoreRepository } from '../../shared/stores/session-store.repository';
import { addDoc, DocumentData } from 'firebase/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetupVerificationService } from '../meetup/meetup-verification/meetup-verification.service';
import { SnackbarService } from '../../shared/snackbar/snackbar.service';

interface Message {
  text: string;
  timestamp: Timestamp;
  user: string;
  userId: string;
}

interface Conversation {
  id: string;
  participants: string[];
}

@Component({
  selector: 'travelquest-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit {
  messages$!: Observable<Message[]> | undefined;
  newMessage: string = '';
  currentUserUID: string | null | undefined;
  currentConversationId: string | null = null;
  otherUserId: string | null = null;
  otherUserName: string | null = null;
  loadingMessages: boolean = true;
  selectedMessage: any = null;
  isRequesting: boolean = false; // Only sends 1 request
  isRequestPending: boolean = false;

  // New property to hold verification requests
  verificationRequests: any[] = [];

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private sessionStore: sessionStoreRepository,
    private meetupVerificationService: MeetupVerificationService,
    private snackbarService: SnackbarService
  ) {}

  ngOnInit(): void {
    this.loadAuthenticatedUser().then(() => {
      this.initializeComponent();
      this.listenForVerificationRequests();
    });
  }

  // Listen for incoming verification requests for the current user
  listenForVerificationRequests(): void {
    if (!this.currentUserUID) {
      console.error('Missing currentUserUID.');
      return;
    }

    if (!this.currentConversationId) {
      console.error('Missing currentConversationId.');
      return;
    }

    console.log('Current User UID:', this.currentUserUID);
    console.log('Current Conversation ID:', this.currentConversationId);

    const requestsCollection = collection(
      this.firestore,
      `conversations/${this.currentConversationId}/meetup-verification-requests`
    );

    const requestsQuery = query(
      requestsCollection,
      where('receiverUID', '==', this.currentUserUID) // Correct field name
    );

    collectionData(requestsQuery, { idField: 'id' }).subscribe(
      (requests) => {
        console.log('Fetched verification requests:', requests);
        this.verificationRequests = requests.filter(
          (x) => x['status'] === 'pending'
        );
      },
      (error) => {
        console.error('Error fetching verification requests:', error);
      }
    );
  }

  handleResponse(request: any, response: string): void {
    if (request.isProcessing) {
      console.log('Request is already being processed.');
      return;
    }

    request.isProcessing = true;

    if (this.currentConversationId) {
      this.sessionStore
        .handleMeetupResponse(
          this.currentConversationId,
          request.id,
          request.senderUID,
          request.receiverUID,
          response
        )
        .then(() => {
          console.log('Meetup response handled successfully.');
          request.isProcessing = false;
        })
        .catch((error) => {
          console.error('Error handling meetup response:', error);
          request.isProcessing = false;
        });
    } else {
      console.error(
        'Current conversation ID is missing. Cannot handle request response.'
      );
      request.isProcessing = false;
    }
  }

  // Send message function
  sendMessage(): void {
    if (!this.newMessage.trim()) {
      console.error('Message is empty.');
      return;
    }

    if (!this.currentUserUID) {
      console.error('User is not authenticated.');
      return;
    }

    if (!this.currentConversationId) {
      this.createNewConversation();
    } else {
      this.sendMessageToFirestore(this.currentConversationId);
    }
  }

  // Function to send the meetup verification request
  callMeetupVerification(): void {
    if (this.isRequesting) {
      return; // Prevent multiple simultaneous requests
    }

    if (this.currentUserUID && this.otherUserId && this.currentConversationId) {
      this.isRequesting = true;

      const requestsCollectionPath = `conversations/${this.currentConversationId}/meetup-verification-requests`;
      const requestsQuery = query(
        collection(this.firestore, requestsCollectionPath),
        where('senderUID', '==', this.currentUserUID),
        where('receiverUID', '==', this.otherUserId),
        where('status', 'in', ['pending', 'accept'])
      );

      getDocs(requestsQuery)
        .then((snapshot) => {
          if (!snapshot.empty) {
            const existingRequest = snapshot.docs[0].data();
            const status = existingRequest['status'];

            if (status === 'accept') {
              throw new Error(
                'A request has already been accepted with this user.'
              );
            } else if (status === 'pending') {
              throw new Error(
                'You already have a pending verification request with this user.'
              );
            }
          }

          // If no conflicts, send the new request
          return this.meetupVerificationService.sendMeetupVerification(
            this.currentUserUID!,
            this.otherUserId!
          );
        })
        .then(() => {
          this.snackbarService.success(
            'Meetup verification request sent successfully.'
          );
        })
        .catch((error: Error) => {
          if (
            error.message.includes('accepted') ||
            error.message.includes('pending')
          ) {
            this.snackbarService.error(error.message);
          } else {
            console.error('Error sending meetup request:', error);
            this.snackbarService.error(
              'Error sending request. Please try again.'
            );
          }
        })
        .finally(() => {
          this.isRequesting = false; // Reset the state
        });
    } else {
      console.error('Missing required information for meetup verification.');
      this.snackbarService.error('Cannot send request. Missing information.');
      this.isRequesting = false; // Ensure state reset
    }
  }

  // Optional: Reset isRequesting if the request fails or succeeds
  handleVerificationRequestResponse(response: string): void {
    this.isRequesting = false; // Re-enable the button after the response
  }

  // Function to open meetup verification modal
  openMeetupVerification(message: any) {
    this.selectedMessage = message;
    // Open modal to accept/decline (trigger modal in your UI)
  }

  private async loadAuthenticatedUser(): Promise<void> {
    this.currentUserUID = await this.sessionStore
      .getCurrentUserUID()
      .toPromise();
    if (!this.currentUserUID) {
      console.error('User is not authenticated.');
    }
  }

  private initializeComponent(): void {
    this.route.paramMap.subscribe((params: any) => {
      const conversationId = params.get('id');
      const otherUserId = params.get('userId');

      if (conversationId) {
        this.currentConversationId = conversationId;
        this.determineOtherUserIdFromConversation(conversationId);
        this.fetchMessagesWithUserNames(conversationId);
      } else if (otherUserId) {
        this.otherUserId = otherUserId;
        this.fetchOtherUserName(otherUserId);
        this.checkExistingConversation(otherUserId);
      } else {
        console.error('Invalid route parameters. No conversation or user ID.');
      }
    });
  }

  private determineOtherUserIdFromConversation(conversationId: string): void {
    const conversationDocRef = doc(
      this.firestore,
      `conversations/${conversationId}`
    );

    getDoc(conversationDocRef).then((snapshot) => {
      if (snapshot.exists()) {
        const participants = snapshot.data()?.['participants'] || [];
        this.otherUserId = participants.find(
          (id: string) => id !== this.currentUserUID
        );
        if (this.otherUserId) {
          this.fetchOtherUserName(this.otherUserId);
        }
      } else {
        console.error('Conversation not found.');
      }
    });
  }

  private fetchOtherUserName(userId: string): void {
    const userDocRef = doc(this.firestore, `publicProfiles/${userId}`);

    getDoc(userDocRef).then((snapshot) => {
      if (snapshot.exists()) {
        this.otherUserName = snapshot.data()?.['name'] || 'Unknown User';
      } else {
        this.otherUserName = 'Unknown User';
        console.error('Other user profile not found.');
      }
    });
  }

  private checkExistingConversation(otherParticipantUid: string): void {
    if (!this.currentUserUID) {
      console.error('Current user not found.');
      return;
    }

    const conversationsCollection = collection(this.firestore, 'conversations');
    const conversationsQuery = query(
      conversationsCollection,
      where('participants', 'array-contains', this.currentUserUID)
    );

    collectionData(conversationsQuery, { idField: 'id' })
      .pipe(
        map((data) =>
          (data as (DocumentData & Conversation)[]).find(
            (conversation) =>
              conversation.participants.length === 2 &&
              conversation.participants.includes(otherParticipantUid) &&
              conversation.participants.includes(this.currentUserUID!)
          )
        )
      )
      .subscribe(
        (existingConversation: Conversation | undefined) => {
          if (existingConversation) {
            this.currentConversationId = existingConversation.id;
            this.fetchMessagesWithUserNames(existingConversation.id);
          } else {
            this.currentConversationId = null;
            this.loadingMessages = false;
          }
        },
        (error: unknown) => {
          console.error('Error checking for existing conversation:', error);
        }
      );
  }

  private fetchMessagesWithUserNames(conversationId: string): void {
    this.loadingMessages = true;

    const messagesCollection = collection(
      this.firestore,
      `conversations/${conversationId}/messages`
    );
    const messagesQuery = query(
      messagesCollection,
      orderBy('timestamp', 'asc')
    );

    this.messages$ = collectionData(messagesQuery, { idField: 'id' }).pipe(
      map((data) =>
        (data as (DocumentData & Message)[]).map((doc) => ({
          text: doc.text,
          timestamp: doc.timestamp,
          userId: doc.userId,
          user: 'Loading...', // Placeholder until actual user name is fetched.
        }))
      ),
      switchMap((messages: Message[]) =>
        from(
          Promise.all(
            messages.map(async (message) => {
              const userDocRef = doc(
                this.firestore,
                `publicProfiles/${message.userId}`
              );
              const userSnapshot = await getDoc(userDocRef);

              if (userSnapshot.exists()) {
                const userName =
                  userSnapshot.data()?.['name'] || 'Unknown User';
                return { ...message, user: userName };
              }
              return { ...message, user: 'Unknown User' };
            })
          )
        )
      )
    );

    this.messages$.subscribe(
      () => {
        this.loadingMessages = false;
      },
      (error) => {
        console.error('Error fetching messages:', error);
        this.loadingMessages = false;
      }
    );
  }

  private createNewConversation(): void {
    const conversationsCollection = collection(this.firestore, 'conversations');
    const newConversation = {
      participants: [this.currentUserUID, this.otherUserId || ''],
      timestamp: Timestamp.fromDate(new Date()),
    };

    addDoc(conversationsCollection, newConversation)
      .then((docRef) => {
        this.currentConversationId = docRef.id;
        this.sendMessageToFirestore(docRef.id);
      })
      .catch((error) => {
        console.error('Error creating new conversation:', error);
      });
  }

  private sendMessageToFirestore(conversationId: string): void {
    const messagesCollection = collection(
      this.firestore,
      `conversations/${conversationId}/messages`
    );

    const message: Message = {
      text: this.newMessage.trim(),
      timestamp: Timestamp.fromDate(new Date()),
      user: this.currentUserUID || '',
      userId: this.currentUserUID || '',
    };

    addDoc(messagesCollection, message)
      .then(() => {
        this.newMessage = '';
      })
      .catch((error) => {
        console.error('Error sending message:', error);
      });
  }
}
