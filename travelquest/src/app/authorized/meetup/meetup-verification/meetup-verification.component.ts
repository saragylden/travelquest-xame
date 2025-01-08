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
import { switchMap } from 'rxjs/operators';
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

  getVerificationRequests(receiverUID: string): Observable<any[]> {
    // Query all conversations where the receiverUID is a participant
    const conversationsCollection = collection(this.firestore, 'conversations');
    const conversationsQuery = query(
      conversationsCollection,
      where('participants', 'array-contains', receiverUID)
    );

    // Fetch conversations and then fetch subcollection data for each conversation
    return collectionData(conversationsQuery, { idField: 'id' }).pipe(
      switchMap(async (conversations: any[]) => {
        const allRequests: any[] = [];

        // Fetch pending requests from each conversation's subcollection
        for (const conversation of conversations) {
          const conversationId = conversation.id;
          const meetupRequestsRef = collection(
            this.firestore,
            `conversations/${conversationId}/meetup-verification-requests`
          );
          const requestsQuery = query(
            meetupRequestsRef,
            where('receiverUID', '==', receiverUID),
            where('status', '==', 'pending')
          );

          const requestsSnapshot = await getDocs(requestsQuery);
          requestsSnapshot.forEach((doc) => {
            allRequests.push({ id: doc.id, ...doc.data() });
          });
        }

        return allRequests;
      }),
      switchMap((promise) => from(promise)) // Flatten the Promise to an Observable
    );
  }
}
