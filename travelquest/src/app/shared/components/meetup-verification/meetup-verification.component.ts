import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class MeetupVerificationService {
  constructor(private firestore: Firestore) {}

  sendMeetupVerification(
    currentUserUID: string,
    otherUserUID: string,
    currentConversationId: string
  ): void {
    const message = {
      text: `Did you meet ${otherUserUID}?`,
      timestamp: Timestamp.fromDate(new Date()),
      user: currentUserUID,
      userId: currentUserUID,
    };

    this.sendMessage(currentConversationId, message);
  }

  private sendMessage(conversationId: string, message: any): void {
    const messagesCollection = collection(
      this.firestore,
      `conversations/${conversationId}/messages`
    );
    addDoc(messagesCollection, message)
      .then(() => {
        console.log('Message sent successfully');
      })
      .catch((error) => {
        console.error('Error sending message: ', error);
      });
  }
}
