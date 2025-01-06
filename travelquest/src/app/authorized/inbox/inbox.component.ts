import { Component, OnInit } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { Observable, of, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from 'firebase/auth';

interface Message {
  text: string;
  timestamp: any;
  user: string;
  userId: string;
  conversationId: string;
}

interface Conversation {
  id: string;
  participants: string[];
}

@Component({
  selector: 'travelquest-inbox',
  templateUrl: './inbox.component.html',
  styleUrls: ['./inbox.component.scss'],
})
export class InboxComponent implements OnInit {
  currentUser: User | null = null;
  conversations$!: Observable<Message[]>;
  userName: string = '';
  loading: boolean = true;
  error: string | null = null;

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Get the authenticated user
    user(this.auth).subscribe((currentUser: User | null) => {
      this.currentUser = currentUser;

      if (this.currentUser) {
        this.userName = this.currentUser.displayName || 'User';
        this.fetchUserConversations();
      } else {
        this.error = 'You must log in to view your inbox.';
        this.loading = false;
      }
    });
  }

  // Fetch conversations for the authenticated user
  fetchUserConversations(): void {
    if (!this.currentUser) {
      console.error('Cannot fetch conversations: User is not authenticated.');
      this.error = 'You must log in to view your inbox.';
      this.loading = false;
      return;
    }

    const conversationsCollection = collection(this.firestore, 'conversations');
    const conversationsQuery = query(
      conversationsCollection,
      where('participants', 'array-contains', this.currentUser.uid),
      orderBy('timestamp', 'desc') // Fetch conversations sorted by recent activity
    );

    this.conversations$ = (
      collectionData(conversationsQuery, {
        idField: 'id',
      }) as Observable<Conversation[]>
    ).pipe(
      switchMap((conversations: Conversation[]) =>
        from(
          Promise.all(
            conversations.map(async (conversation) => {
              const otherUserId = conversation.participants.find(
                (participant) => participant !== this.currentUser!.uid
              );

              const userName = otherUserId
                ? await this.getUserName(otherUserId)
                : 'Unknown User';

              return {
                conversationId: conversation.id,
                userId: otherUserId || '',
                user: userName,
              } as Message; // Cast to Message to match the expected output type
            })
          )
        )
      ),
      catchError((error) => {
        console.error('Error fetching conversations:', error);
        this.error = 'Failed to load inbox. Please try again later.';
        this.loading = false;
        return of([] as Message[]); // Ensure the fallback is properly typed
      })
    );

    this.loading = false; // Stop the loading spinner after setting up the observable
  }

  // Fetch the user's name from Firestore
  private async getUserName(userId: string): Promise<string> {
    const userDocRef = doc(this.firestore, `publicProfiles/${userId}`);
    try {
      const userSnapshot = await getDoc(userDocRef);
      if (userSnapshot.exists()) {
        const data = userSnapshot.data();
        return data['name'] || 'Unknown User';
      }
    } catch (error) {
      console.error('Error fetching user name:', error);
    }
    return 'Unknown User';
  }

  // Redirect to a specific conversation
  openConversation(conversationId: string): void {
    if (!conversationId) {
      console.error('Conversation ID is missing.');
      return;
    }

    this.router.navigate([`/conversation/${conversationId}`]).catch((err) => {
      console.error('Failed to navigate to the conversation:', err);
    });
  }

  // Fetch profile photo for a user or return a default
  getProfilePhoto(userId: string): string {
    return `assets/images/default-pic-green.png`;
  }
}
