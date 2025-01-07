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

export interface SessionStoreProps {
  logoutTime: string | null;
}

@Injectable({ providedIn: 'root' })
export class sessionStoreRepository {
  private store = this.createStore();

  constructor(
    private readonly firebaseAuth: Auth,
    private readonly firestore: Firestore,
    private readonly storage: Storage
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
  // Keep count on requests sent
  async sendMeetupRequest(
    senderUID: string,
    receiverUID: string
  ): Promise<void> {
    const meetupRequestsCollection = collection(
      this.firestore,
      'meetup-verification-requests'
    );

    // Check if there's an existing pending request from the sender to the receiver
    const pendingRequestsQuery = query(
      meetupRequestsCollection,
      where('senderUID', '==', senderUID),
      where('receiverUID', '==', receiverUID),
      where('status', '==', 'pending')
    );

    const pendingRequests = await getDocs(pendingRequestsQuery);

    if (pendingRequests.docs.length > 0) {
      throw new Error('You already have a pending request with this user.');
    }

    // Check how many requests the sender has already sent to this receiver
    const sentRequestsQuery = query(
      meetupRequestsCollection,
      where('senderUID', '==', senderUID),
      where('receiverUID', '==', receiverUID)
    );

    const sentRequests = await getDocs(sentRequestsQuery);
    const requestCount = sentRequests.docs.length;

    const requestLimit = 5; // Adjust this limit as needed
    if (requestCount >= requestLimit) {
      throw new Error('Request limit reached for this user.');
    }

    // If the limit is not reached, send the new request
    const newRequest = {
      requestType: 'meetup-verification',
      text: `Did you meet ${senderUID}?`,
      timestamp: Timestamp.fromDate(new Date()),
      senderUID: senderUID,
      receiverUID: receiverUID,
      status: 'pending', // Request is still pending
    };

    // Add the request to the Firestore collection
    await addDoc(meetupRequestsCollection, newRequest);

    // Now update the meetup count for the sender in their profile
    const publicProfileRef = doc(this.firestore, `publicProfiles/${senderUID}`);

    await runTransaction(this.firestore, async (transaction) => {
      const publicProfileDoc = await transaction.get(publicProfileRef);
      if (publicProfileDoc.exists()) {
        let meetupCount = publicProfileDoc.data()?.['meetupCount'] || 0;
        meetupCount++; // Increment the count by 1

        // Update the profile with the new count
        transaction.update(publicProfileRef, {
          meetupCount: meetupCount,
        });
      } else {
        throw new Error('Public profile not found');
      }
    });

    console.log('Meetup verification request sent successfully');
  }

  private createStore(): typeof store {
    const store = createStore(
      { name: 'sessionStore' },
      withProps<SessionStoreProps>({ logoutTime: null })
    );

    return store;
  }
}
