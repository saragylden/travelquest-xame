import { Component, OnInit } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  collectionData,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { Observable, from } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { map, switchMap } from 'rxjs/operators';
import { sessionStoreRepository } from '../../shared/stores/session-store.repository';
import { DocumentData } from 'firebase/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar'; // Import MatSnackBar
import { MeetupDialogComponent } from '../../shared/components/meetup-dialog/meetup-dialog.component';

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

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private sessionStore: sessionStoreRepository,
    private dialog: MatDialog,
    private snackBar: MatSnackBar // Add MatSnackBar service
  ) {}

  ngOnInit(): void {
    this.loadAuthenticatedUser().then(() => {
      this.initializeComponent();
    });
  }

  openMeetupDialog(): void {
    if (
      !this.currentUserUID ||
      !this.otherUserId ||
      !this.currentConversationId
    ) {
      console.error('Missing information for meetup request.');
      return;
    }

    // Save the meetup request to Firestore
    const meetupRequestRef = collection(
      this.firestore,
      `conversations/${this.currentConversationId}/meetupRequests`
    );

    addDoc(meetupRequestRef, {
      sender: this.currentUserUID,
      receiver: this.otherUserId,
      timestamp: Timestamp.fromDate(new Date()),
      status: 'pending', // Mark as pending for further processing
    })
      .then((docRef) => {
        // Show snackbar to confirm the request
        this.snackBar.open('The request has been sent.', 'Close', {
          duration: 3000,
        });

        // Open the dialog and pass the requestId and receiver flag
        const dialogRef = this.dialog.open(MeetupDialogComponent, {
          data: {
            name: this.otherUserName || 'Unknown User',
            requestId: docRef.id,
            isReceiver: false, // This is the sender
          },
        });

        dialogRef.afterClosed().subscribe((result) => {
          console.log('Dialog result:', result);
          if (result) {
            console.log(`User selected: ${result}`);
          }
        });
      })
      .catch((error) => {
        console.error('Error sending meetup request:', error);
      });
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
    this.route.paramMap.subscribe((params) => {
      const conversationId = params.get('id');
      const otherUserId = params.get('userId');

      if (conversationId) {
        this.currentConversationId = conversationId;
        this.determineOtherUserIdFromConversation(conversationId);
        this.fetchMessagesWithUserNames(conversationId);
      } else if (otherUserId) {
        this.otherUserId = otherUserId;
        this.fetchOtherUserName(otherUserId); // Fetch the other user's name directly
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
      user: this.currentUserUID || 'Anonymous',
      userId: this.currentUserUID!,
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
