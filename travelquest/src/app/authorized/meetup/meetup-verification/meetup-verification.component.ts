// meetup-verification.service.ts
import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  Timestamp,
  collectionData,
  query,
  where,
} from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SnackbarService } from '../../../shared/snackbar/snackbar.service';

@Injectable({
  providedIn: 'root',
})
export class MeetupVerificationService {
  constructor(
    private firestore: Firestore,
    private snackbarService: SnackbarService
  ) {}

  // Method to send verification request
  sendMeetupVerification(currentUserUID: string, otherUserUID: string): void {
    const verificationRequest = {
      requestType: 'meetup-verification',
      text: `Did you meet ${currentUserUID}?`, // Customize the message
      timestamp: Timestamp.fromDate(new Date()),
      senderUID: currentUserUID,
      receiverUID: otherUserUID,
      status: 'pending', // Pending verification
    };

    // Store the verification request in Firestore
    this.sendVerificationRequest(verificationRequest);
  }

  private sendVerificationRequest(verificationRequest: any): void {
    const verificationRequestsCollection = collection(
      this.firestore,
      'meetup-verification-requests'
    );

    addDoc(verificationRequestsCollection, verificationRequest)
      .then(() => {
        console.log('Meetup verification request sent successfully');
        this.snackbarService.success(
          'Meetup verification request sent successfully'
        );
      })
      .catch((error) => {
        console.error('Error sending verification request: ', error);
        this.snackbarService.error('Error sending request', 'Retry', 5000);
      });
  }

  // Listen for verification requests for the other user
  getVerificationRequests(receiverUID: string) {
    const verificationRequestsCollection = collection(
      this.firestore,
      'meetup-verification-requests'
    );

    // Query to get only requests for the specified receiver
    return collectionData(
      query(
        verificationRequestsCollection,
        where('receiverUID', '==', receiverUID),
        where('status', '==', 'pending')
      ),
      { idField: 'id' }
    );
  }
}
