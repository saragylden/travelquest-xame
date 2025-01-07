import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { AuthorizedComponent } from './authorized.component';
import { AuthorizedRoutingModule } from './authorized-router.module';
import { NavbarComponent } from '../navbar/navbar.component';
// import { RouterModule, Routes } from '@angular/router';
import { ProfileCreationComponent } from './profile-creation/profile-creation.component';
import { ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import { MaterialModule } from '../material/material.config';
import { ProfileListComponent } from './profile/profile-list/profile-list.component';
import { ProfileEditComponent } from './profile/profile-edit/profile-edit.component';
import { ProfileSettingsComponent } from './profile/profile-settings/profile-settings.component';
import { HomeComponent } from './home/home.component';
import { TravellogComponent } from './profile/travellog/travellog.component';
import { ExploreComponent } from './explore/explore.component';
import { NotFoundComponent } from './404page/notfound.component';
import { UserProfileComponent } from './user-profile/user-profile.component';
import { ChatComponent } from './chat/chat.component';
import { InboxComponent } from './inbox/inbox.component';
import { MeetupVerificationModalComponent } from './meetup-verification-modal/meetup-verification-modal.component';

@NgModule({
  declarations: [
    AuthorizedComponent,
    NavbarComponent,
    ProfileCreationComponent,
    ProfileListComponent,
    ProfileEditComponent,
    ProfileSettingsComponent,
    HomeComponent,
    TravellogComponent,
    ExploreComponent,
    NotFoundComponent,
    UserProfileComponent,
    ChatComponent,
    InboxComponent,
    MeetupVerificationModalComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AuthorizedRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    MaterialModule,
  ],
})
export class AuthorizedModule {}
