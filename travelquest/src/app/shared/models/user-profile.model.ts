// Directly in profile-list.component.ts (less recommended)

import { Time } from '@angular/common';
import { Timestamp } from 'firebase/firestore';

export interface Hashtag {
  tag: string;
  category: string;
}

export interface UserProfile {
  name: string;
  age: number;
  country: string;
  languages: string[];
  hashtags: Hashtag[];
  bio: string;
  travels: number;
  meetups: number;
  profilePicture: string;
  meetupCount: number;
}

export interface UserEditProfile {
  dob?: Timestamp;
  age?: number | null;
  hashtags?: Hashtag[];
  name: string;
  bio: string;
  email: string;
  country: string;
  languages: string[];
  meetups: string;
}
