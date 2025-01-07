import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { sessionStoreRepository } from '../../../shared/stores/session-store.repository';
import ISO6391 from 'iso-639-1';
import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { SnackbarService } from '../../../shared/snackbar/snackbar.service';

interface Hashtag {
  tag: string;
  category: string;
}

@Component({
  selector: 'travelquest-profile-edit',
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.scss'],
})
export class ProfileEditComponent implements OnInit {
  profileForm!: FormGroup;
  languages: string[] = [];
  availableLanguages: string[] = [];
  predefinedHashtags: Hashtag[] = [];
  customHashtags: string[] = [];
  selectedHashtags: { tag: string; category: string }[] = [];
  separatorKeysCodes: number[] = [ENTER, COMMA];

  constructor(
    private fb: FormBuilder,
    private sessionStore: sessionStoreRepository,
    private router: Router,
    private snackbarService: SnackbarService
  ) {}

  ngOnInit(): void {
    this.fetchPredefinedHashtags();
    this.fetchAvailableLanguages();

    this.sessionStore.getSignedInUserFullProfile().subscribe((userProfile) => {
      const predefinedTags =
        userProfile?.hashtags?.map((h: any) => h.tag) || [];
      this.customHashtags = (userProfile?.hashtags || [])
        .filter((h: any) => h.category === 'custom')
        .map((h: any) => h.tag);

      this.profileForm = this.fb.group({
        name: [userProfile?.name || '', Validators.required],
        email: [
          userProfile?.email || '',
          [Validators.required, Validators.email],
        ],
        dob: [
          userProfile?.dob ? new Date(userProfile.dob.toDate()) : '',
          Validators.required,
        ],
        bio: [userProfile?.bio || ''],
        languages: [userProfile?.languages || [], Validators.required],
        country: [userProfile?.country || ''],
        hashtags: [predefinedTags],
        customHashtags: [this.customHashtags],
      });
    });
  }

  fetchAvailableLanguages(): void {
    this.availableLanguages = ISO6391.getAllNames().sort((a, b) =>
      a.localeCompare(b)
    );
  }

  fetchPredefinedHashtags(): void {
    this.sessionStore.fetchPredefinedHashtags().then((hashtags) => {
      this.predefinedHashtags = hashtags;
    });
  }

  addCustomHashtag(event: any): void {
    const input = event.input;
    const value = event.value;

    if ((value || '').trim()) {
      this.customHashtags.push(value.trim());
      this.profileForm.get('customHashtags')?.setValue(this.customHashtags);
    }

    if (input) {
      input.value = '';
    }
  }

  removeCustomHashtag(tag: string): void {
    const index = this.customHashtags.indexOf(tag);

    if (index >= 0) {
      this.customHashtags.splice(index, 1);
      // Sync with FormGroup
      this.profileForm.get('customHashtags')?.setValue(this.customHashtags);
    }
  }

  onSubmit(): void {
    if (this.profileForm.valid) {
      const updatedData = {
        ...this.profileForm.value,
        hashtags: [
          ...this.predefinedHashtags
            .filter((h) => this.profileForm.value.hashtags.includes(h.tag))
            .map((h) => ({ tag: h.tag, category: h.category })),
          ...this.customHashtags.map((tag) => ({ tag, category: 'custom' })),
        ],
      };

      this.sessionStore
        .saveUserProfile(updatedData)
        .then(() => {
          this.snackbarService.success('Profile updated successfully!');
          this.router.navigate(['/profile']);
        })
        .catch((error) => {
          console.error('Error updating profile:', error);
          this.snackbarService.error(
            'Error updating profile. Please try again.'
          );
        });
    } else {
      this.snackbarService.error('Please fill in all required fields.');
    }
  }
}
