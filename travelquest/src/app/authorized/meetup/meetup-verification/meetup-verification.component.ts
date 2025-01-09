import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  getDocs,
  doc,
  collectionGroup,
} from '@angular/fire/firestore';
import { SnackbarService } from '../../../shared/snackbar/snackbar.service';
import { sessionStoreRepository } from '../../../shared/stores/session-store.repository';
import { map } from 'rxjs/operators';
import { Observable, from } from 'rxjs';

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
    // Reference to the collection
    const requestsQuery = query(
      collectionGroup(this.firestore, 'meetup-verification-requests'),
      where('senderUID', '==', currentUserUID),
      where('receiverUID', '==', otherUserUID),
      where('status', 'in', ['pending', 'accepted'])
    );

    // Query Firestore for existing requests
    getDocs(requestsQuery)
      .then((snapshot) => {
        if (!snapshot.empty) {
          // Existing request found, handle error
          const existingRequestStatus = snapshot.docs[0].data()['status'];
          if (existingRequestStatus === 'pending') {
            throw new Error('You already have a pending request.');
          } else if (existingRequestStatus === 'accepted') {
            throw new Error(
              'You cannot send a request as an accepted one already exists.'
            );
          }
        }

        // No conflicting request, proceed to send a new request
        return this.sessionStoreRepository.sendMeetupRequest(
          currentUserUID,
          otherUserUID
        );
      })
      .then(() => {
        this.snackbarService.success(
          'Meetup verification request sent successfully'
        );
      })
      .catch((error: any) => {
        // Handle error feedback
        if (error.message === 'You already have a pending request.') {
          this.snackbarService.error(
            'You already have a pending verification request with this user.'
          );
        } else if (
          error.message ===
          'You cannot send a request as an accepted one already exists.'
        ) {
          this.snackbarService.error(
            'A request has already been accepted with this user.'
          );
        } else if (error.message === 'Request limit reached for this user.') {
          this.snackbarService.error(
            'You have reached the maximum request limit for this user.'
          );
        } else {
          console.error('Error sending verification request:', error);
          this.snackbarService.error('Error sending request', 'Retry', 5000);
        }
      });
  }

  getVerificationRequests(receiverUID: string): Observable<any[]> {
    const requestsQuery = query(
      collectionGroup(this.firestore, 'meetup-verification-requests'),
      where('receiverUID', '==', receiverUID),
      where('status', '==', 'pending')
    );

    return collectionData(requestsQuery, { idField: 'id' }).pipe(
      map((requests) => {
        console.log('Fetched Requests via collectionGroup:', requests);
        return requests;
      })
    );
  }
}
