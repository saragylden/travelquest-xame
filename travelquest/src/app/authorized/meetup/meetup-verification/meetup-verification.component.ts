import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  Timestamp,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class MeetupVerificationService {
  constructor(private firestore: Firestore) {}

  sendMeetupVerification(currentUserUID: string, otherUserUID: string): void {
    // Create a new verification request
    const verificationRequest = {
      requestType: 'meetup-verification',
      text: `Did you meet ${currentUserUID}?`, // Customize the message
      timestamp: Timestamp.fromDate(new Date()),
      senderUID: currentUserUID, // Current user (sender)
      receiverUID: otherUserUID, // Other user (receiver)
      status: 'pending', // Pending verification (waiting for user response)
    };

    this.sendVerificationRequest(verificationRequest);
  }

  private sendVerificationRequest(verificationRequest: any): void {
    const verificationRequestsCollection = collection(
      this.firestore,
      'meetup-verification-requests' // New collection to store these requests
    );

    // Add the verification request to the collection
    addDoc(verificationRequestsCollection, verificationRequest)
      .then(() => {
        console.log('Meetup verification request sent successfully');
      })
      .catch((error) => {
        console.error('Error sending verification request: ', error);
      });
  }
}
