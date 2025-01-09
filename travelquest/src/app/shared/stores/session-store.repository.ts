import { Injectable } from '@angular/core';
import { createStore, withProps } from '@ngneat/elf';
import {
  Auth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from '@angular/fire/auth';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from '@angular/fire/storage';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { addDoc, query, runTransaction, where } from 'firebase/firestore';
import { UserEditProfile } from '../models/user-profile.model';
import { SnackbarService } from '../snackbar/snackbar.service';

export interface SessionStoreProps {
  logoutTime: string | null;
}

interface PublicProfile {
  meetupCount?: number;
}

interface Conversation {
  participants: string[];
  participantKey: string;
  meetupStatus?: {
    confirmed: boolean;
    lastRequestId?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class sessionStoreRepository {
  private store = this.createStore();

  constructor(
    private readonly firebaseAuth: Auth,
    private readonly firestore: Firestore,
    private readonly storage: Storage,
    private snackbarService: SnackbarService
  ) {}

  // Register with email and password
  register(
    email: string,
    name: string,
    password: string,
    dob: string
  ): Observable<void> {
    const promise = createUserWithEmailAndPassword(
      this.firebaseAuth,
      email,
      password
    ).then(async (userCredential) => {
      const user = userCredential.user;

      // Update user's profile with display name
      await updateProfile(user, { displayName: name });

      // Save private user data
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: email,
        createdAt: new Date().toISOString(),
      });

      // Save public user data
      const dobTimestamp = Timestamp.fromDate(new Date(dob));
      const publicDocRef = doc(this.firestore, `publicProfiles/${user.uid}`);
      await setDoc(publicDocRef, {
        uid: user.uid,
        name: name,
        dob: dobTimestamp,
        bio: '',
        country: '',
        languages: [],
        hashtags: [],
        createdAt: new Date().toISOString(),
      });
    });

    return from(promise);
  }

  // Google Sign-In logic
  googleSignIn(): Observable<void> {
    const provider = new GoogleAuthProvider();

    const promise = signInWithPopup(this.firebaseAuth, provider).then(
      async (userCredential) => {
        const user = userCredential.user;

        if (user) {
          const userDocRef = doc(this.firestore, `users/${user.uid}`);
          const publicDocRef = doc(
            this.firestore,
            `publicProfiles/${user.uid}`
          );

          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            createdAt: new Date().toISOString(),
          });

          await setDoc(publicDocRef, {
            uid: user.uid,
            name: user.displayName || 'Google User',
            dob: Timestamp.fromDate(new Date('1970-01-01')),
            bio: '',
            country: '',
            languages: [],
            hashtags: [],
            createdAt: new Date().toISOString(),
          });
        }
      }
    );

    return from(promise);
  }

  // Get the current user's UID if logged in
  getCurrentUserUID(): Observable<string | null> {
    return new Observable<string | null>((observer) => {
      onAuthStateChanged(this.firebaseAuth, (user) => {
        if (user) {
          console.log('Firebase Auth State Changed: User UID:', user.uid);
          observer.next(user.uid);
        } else {
          console.warn('Firebase Auth State Changed: No user logged in.');
          observer.next(null);
        }
        observer.complete();
      });
    });
  }

  getUserProfile(uid: string): Observable<any> {
    const publicDocRef = doc(this.firestore, `publicProfiles/${uid}`);
    return from(getDoc(publicDocRef)).pipe(
      map((docSnapshot) => {
        if (docSnapshot.exists()) {
          const profileData = docSnapshot.data();

          // Calculate age if dob exists and is a valid Timestamp
          if (profileData?.['dob'] instanceof Timestamp) {
            const dob = profileData['dob'].toDate();
            const currentDate = new Date();
            let age = currentDate.getFullYear() - dob.getFullYear();
            const month = currentDate.getMonth() - dob.getMonth();
            if (
              month < 0 ||
              (month === 0 && currentDate.getDate() < dob.getDate())
            ) {
              age--;
            }
            profileData['age'] = age;
          } else {
            profileData['age'] = null;
          }

          return profileData;
        }
        return null;
      })
    );
  }

  // Save user profile (both private and public data)
  saveUserProfile(data: any): Promise<void> {
    const user = this.firebaseAuth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    const publicDocRef = doc(this.firestore, `publicProfiles/${user.uid}`);

    // Handle private data (ensure email is defined)
    const privateData = data.email ? { email: data.email } : undefined;

    if (!privateData) {
      console.warn('No email provided for private profile update.');
    }

    // Prepare public data
    const publicData = { ...data };
    delete publicData.email; // Remove sensitive data from public profile

    // Update Firestore collections
    const privateUpdate = privateData
      ? setDoc(userDocRef, privateData, { merge: true })
      : Promise.resolve(); // Skip update if privateData is undefined

    const publicUpdate = setDoc(publicDocRef, publicData, { merge: true });

    return Promise.all([privateUpdate, publicUpdate])
      .then(() => console.log('Profile updated successfully!'))
      .catch((error) => {
        console.error('Error saving profile:', error);
        throw error; // Ensure errors are propagated
      });
  }

  // Fetch signed-in user's public profile
  getSignedInUserProfile(): Observable<any> {
    return this.getCurrentUserUID().pipe(
      switchMap((uid) =>
        uid
          ? this.getUserProfile(uid).pipe(
              map((profile) => {
                if (profile && profile.dob instanceof Timestamp) {
                  // Calculate the age using the dob as a Firestore Timestamp
                  const dob = profile.dob.toDate();
                  const currentDate = new Date();
                  const age = currentDate.getFullYear() - dob.getFullYear();
                  const month = currentDate.getMonth() - dob.getMonth();
                  if (
                    month < 0 ||
                    (month === 0 && currentDate.getDate() < dob.getDate())
                  ) {
                    // Subtract one year if the birthday hasn't occurred yet this year
                    return { ...profile, age: age - 1 };
                  }
                  return { ...profile, age: age }; // Return profile with calculated age
                }
                return profile;
              })
            )
          : of(null)
      )
    );
  }

  // Fetch signed-in user's full profile (public + private)
  getSignedInUserFullProfile(): Observable<UserEditProfile> {
    return this.getCurrentUserUID().pipe(
      switchMap((uid) => {
        if (!uid) {
          // Default profile for guest users
          return of({
            name: 'Guest',
            bio: '',
            email: '',
            country: '',
            hashtags: [],
            languages: [],
            meetups: '',
            age: null, // Default age for guest
          } as UserEditProfile);
        }

        const privateUserRef = doc(this.firestore, `users/${uid}`);
        const publicUserRef = doc(this.firestore, `publicProfiles/${uid}`);

        return from(
          Promise.all([getDoc(privateUserRef), getDoc(publicUserRef)])
        ).pipe(
          map(([privateDoc, publicDoc]) => {
            const privateData = privateDoc.exists() ? privateDoc.data() : {};
            const publicData = publicDoc.exists() ? publicDoc.data() : {};

            // Combine profiles with defaults
            const profile: UserEditProfile = {
              name: publicData['name'] || '',
              bio: publicData['bio'] || '',
              email: privateData['email'] || '',
              country: publicData['country'] || '',
              hashtags: publicData['hashtags'] || [],
              languages: publicData['languages'] || [],
              meetups: publicData['meetups'] || '',
              dob: publicData['dob'] || null, // Ensure dob exists
            };

            // Calculate age if dob is valid
            if (profile.dob instanceof Timestamp) {
              const dob = profile.dob.toDate();
              const currentDate = new Date();
              const age = currentDate.getFullYear() - dob.getFullYear();
              const month = currentDate.getMonth() - dob.getMonth();
              profile.age =
                month < 0 ||
                (month === 0 && currentDate.getDate() < dob.getDate())
                  ? age - 1
                  : age;
            } else {
              profile.age = null; // Default age when dob is invalid or missing
            }

            return profile;
          })
        );
      })
    );
  }

  // Upload profile photo
  uploadProfilePhoto(file: File): Promise<string> {
    const user = this.firebaseAuth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const photoRef = ref(this.storage, `profilePhotos/${user.uid}`);
    return uploadBytes(photoRef, file).then(() =>
      getDownloadURL(photoRef).then((url: string) => {
        console.log('Uploaded photo URL:', url);
        return url;
      })
    );
  }

  // Fetch predefined hashtags from Firestore
  async fetchPredefinedHashtags(): Promise<
    { tag: string; category: string; color: string }[]
  > {
    const hashtagsRef = collection(this.firestore, 'hashtags');
    const snapshot = await getDocs(hashtagsRef);

    return snapshot.docs.map(
      (doc) => doc.data() as { tag: string; category: string; color: string }
    );
  }

  // Sign out logic
  signOut(): Promise<void> {
    return this.firebaseAuth
      .signOut()
      .then(() => {
        console.log('Successfully signed out');
      })
      .catch((error) => {
        console.error('Error signing out:', error);
        throw error;
      });
  }

  // Delete user account
  deleteAccount(): Promise<void> {
    const user = this.firebaseAuth.currentUser;
    if (user) {
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      const publicDocRef = doc(this.firestore, `publicProfiles/${user.uid}`);

      return runTransaction(this.firestore, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        const publicDoc = await transaction.get(publicDocRef);

        if (!userDoc.exists() || !publicDoc.exists()) {
          throw new Error('User data not found in Firestore');
        }

        transaction.delete(userDocRef);
        transaction.delete(publicDocRef);
      })
        .then(() => {
          return user.delete();
        })
        .then(() => {
          console.log('User account and associated data deleted');
        })
        .catch((error) => {
          console.error('Error deleting user data or account:', error);
          throw error;
        });
    } else {
      return Promise.reject('No user is currently signed in');
    }
  }

  // Updates travels in Firestore
  async updateTravelsCount(uid: string, newCount: number): Promise<void> {
    const userDocRef = doc(this.firestore, `publicProfiles/${uid}`);

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);

        if (userDoc.exists()) {
          transaction.update(userDocRef, {
            travels: newCount,
          });
          console.log('Updated travels count to:', newCount);
        } else {
          throw new Error('User document does not exist!');
        }
      });
    } catch (error) {
      console.error('Error updating travels count:', error);
    }
  }

  // Keep count on requests sent
  async sendMeetupRequest(
    senderUID: string,
    receiverUID: string
  ): Promise<void> {
    const conversationsRef = collection(this.firestore, 'conversations');

    // Query for a conversation where the sender is a participant
    const conversationQuery = query(
      conversationsRef,
      where('participants', 'array-contains', senderUID)
    );
    const conversationSnapshot = await getDocs(conversationQuery);

    // Find a conversation with both participants
    let conversationId: string | undefined;
    for (const doc of conversationSnapshot.docs) {
      const data = doc.data() as Conversation; // Cast to the Conversation interface
      if (data.participants.includes(receiverUID)) {
        conversationId = doc.id;
        break;
      }
    }

    if (!conversationId) {
      throw new Error('No conversation exists between the users.');
    }

    console.log(`Conversation found: ${conversationId}`);

    // Reference to the meetup-requests subcollection within this conversation
    const meetupRequestsRef = collection(
      this.firestore,
      `conversations/${conversationId}/meetup-verification-requests`
    );

    // Check if the users have an accepted request
    const acceptedRequestsQuery = query(
      meetupRequestsRef,
      where('senderUID', '==', senderUID),
      where('receiverUID', '==', receiverUID),
      where('status', '==', 'accept')
    );
    const acceptedRequests = await getDocs(acceptedRequestsQuery);

    if (acceptedRequests.docs.length > 0) {
      console.log(
        'You cannot send a request as an accepted one already exists.'
      );
      this.snackbarService.error(
        'You cannot send a request as an accepted one already exists.'
      );
      return; // Exit the function
    }

    // Check if there's an existing pending request
    const pendingRequestsQuery = query(
      meetupRequestsRef,
      where('senderUID', '==', senderUID),
      where('receiverUID', '==', receiverUID),
      where('status', '==', 'pending')
    );
    const pendingRequests = await getDocs(pendingRequestsQuery);

    if (pendingRequests.docs.length > 0) {
      throw new Error('You already have a pending request with this user.');
    }

    // Create the new request object
    const newRequest = {
      requestType: 'meetup-verification',
      text: `Did you meet ${senderUID}?`,
      timestamp: Timestamp.fromDate(new Date()),
      senderUID,
      receiverUID,
      status: 'pending', // Request is pending
    };

    // Add the new request to the meetup-requests subcollection
    const requestDocRef = await addDoc(meetupRequestsRef, newRequest);

    // Optionally update the conversation with the last request ID
    const conversationDocRef = doc(
      this.firestore,
      `conversations/${conversationId}`
    );
    await updateDoc(conversationDocRef, {
      'meetupStatus.lastRequestId': requestDocRef.id,
    });

    console.log('Meetup request sent successfully.');
  }

  // Handle meetup request responses (accept/decline)
  async handleMeetupResponse(
    conversationId: string,
    requestId: string,
    senderUID: string,
    receiverUID: string,
    response: string
  ): Promise<void> {
    const verificationRequestRef = doc(
      this.firestore,
      `conversations/${conversationId}/meetup-verification-requests/${requestId}`
    );

    const senderProfileRef = doc(this.firestore, `publicProfiles/${senderUID}`);
    const receiverProfileRef = doc(
      this.firestore,
      `publicProfiles/${receiverUID}`
    );

    // Add check for existing accepted request between sender and receiver
    const existingAcceptedRequestRef = collection(
      this.firestore,
      `conversations/${conversationId}/meetup-verification-requests`
    );

    // Query for an accepted request
    const acceptedQuery = query(
      existingAcceptedRequestRef,
      where('status', '==', 'accept'),
      where('senderUID', 'in', [senderUID, receiverUID]),
      where('receiverUID', 'in', [senderUID, receiverUID])
    );

    const querySnapshot = await getDocs(acceptedQuery);

    // If there is an existing accepted request, reject further requests
    if (!querySnapshot.empty) {
      throw new Error(
        'An accepted request already exists between these users.'
      );
    }

    // Continue with the transaction if no accepted request exists
    await runTransaction(this.firestore, async (transaction) => {
      // Read all required documents first
      const senderProfileDoc = await transaction.get(senderProfileRef);
      const receiverProfileDoc = await transaction.get(receiverProfileRef);

      // Ensure documents exist before proceeding
      if (!senderProfileDoc.exists()) {
        throw new Error('Sender public profile not found.');
      }
      if (!receiverProfileDoc.exists()) {
        throw new Error('Receiver public profile not found.');
      }

      // Extract current data
      const senderProfileData = senderProfileDoc.data() as PublicProfile;
      const receiverProfileData = receiverProfileDoc.data() as PublicProfile;

      // Prepare updates
      const updatedSenderMeetupCount = (senderProfileData.meetupCount || 0) + 1;
      const updatedReceiverMeetupCount =
        (receiverProfileData.meetupCount || 0) + 1;

      // Perform all writes after reads
      if (response === 'accept') {
        transaction.update(senderProfileRef, {
          meetupCount: updatedSenderMeetupCount,
        });
        transaction.update(receiverProfileRef, {
          meetupCount: updatedReceiverMeetupCount,
        });
      }

      transaction.update(verificationRequestRef, { status: response });
    });

    console.log('Meetup response handled and counts updated successfully.');
  }

  // Create a new instance of the session store
  private createStore(): typeof store {
    const store = createStore(
      { name: 'sessionStore' },
      withProps<SessionStoreProps>({ logoutTime: null })
    );

    return store;
  }
}
