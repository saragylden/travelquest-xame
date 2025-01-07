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
import { DocumentData } from 'firebase/firestore'; // Correct import for DocumentData
import { MatDialog } from '@angular/material/dialog';
import { MeetupVerificationModalComponent } from '../meetup-verification-modal/meetup-verification-modal.component';

interface Message {
  text: string;
  timestamp: Timestamp;
  user: string; // Will store the user name
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
  messages$!: Observable<Message[]> | undefined; // Observable for conversation messages
  newMessage: string = ''; // Input for new messages
  currentUserUID: string | null | undefined;
  currentConversationId: string | null = null; // Active conversation ID
  otherUserId: string | null = null; // User ID of the other participant
  loadingMessages: boolean = true; // Loading state for messages

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private sessionStore: sessionStoreRepository,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadAuthenticatedUser().then(() => {
      this.initializeComponent();
    });
  }

  //open modal
  openMeetupVerificationModal(): void {
    const dialogRef = this.dialog.open(MeetupVerificationModalComponent, {
      width: '400px',
      data: { sender: 'Other User Name' }, // Replace with dynamic data
    });

    dialogRef.afterClosed().subscribe((result: boolean | undefined) => {
      if (result === true) {
        console.log('User confirmed the meetup.');
        // Handle positive confirmation (e.g., update database)
      } else if (result === false) {
        console.log('User denied the meetup.');
        // Handle negative confirmation
      } else {
        console.log('Dialog was closed without action.');
      }
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
      const conversationId = params.get('id'); // For `conversation/:id`
      const otherUserId = params.get('userId'); // For `chat/:userId`

      if (conversationId) {
        this.currentConversationId = conversationId;
        this.fetchMessagesWithUserNames(conversationId);
      } else if (otherUserId) {
        this.otherUserId = otherUserId;
        this.checkExistingConversation(this.otherUserId);
      } else {
        console.error('Invalid route parameters. No conversation or user ID.');
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
          // CHANGE: Added type assertion for DocumentData & Conversation.
          // Reason: To ensure TypeScript knows the structure of the data being accessed.
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
        // CHANGE: Added type assertion for DocumentData & Message.
        // Reason: Ensures TypeScript recognizes fields like `text` and `timestamp`.
        (data as (DocumentData & Message)[]).map((doc) => ({
          text: doc.text, // CHANGE: Accessing `text` directly after type assertion.
          timestamp: doc.timestamp, // CHANGE: Accessing `timestamp` directly after type assertion.
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
