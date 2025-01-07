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
import { SnackbarService } from '../../../shared/snackbar/snackbar.service';
import { sessionStoreRepository } from '../../../shared/stores/session-store.repository';

@Injectable({
  providedIn: 'root',
})
export class MeetupVerificationService {
  constructor(
    private firestore: Firestore,
    private snackbarService: SnackbarService,
    private sessionStoreRepository: sessionStoreRepository
  ) {}

  sendMeetupVerification(currentUserUID: string, otherUserUID: string): void {
    this.sessionStoreRepository
      .sendMeetupRequest(currentUserUID, otherUserUID)
      .then(() => {
        this.snackbarService.success(
          'Meetup verification request sent successfully'
        );
      })
      .catch((error: any) => {
        if (error.message === 'Request limit reached for this user.') {
          this.snackbarService.error(
            'You have reached the maximum request limit for this user.'
          );
        } else if (error.message === 'You already have a pending request.') {
          this.snackbarService.error(
            'You already have a pending verification request with this user.'
          );
        } else {
          console.error('Error sending verification request:', error);
          this.snackbarService.error('Error sending request', 'Retry', 5000);
        }
      });
  }

  getVerificationRequests(receiverUID: string) {
    const verificationRequestsCollection = collection(
      this.firestore,
      'meetup-verification-requests'
    );

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
