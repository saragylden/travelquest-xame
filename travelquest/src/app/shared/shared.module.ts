import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../material/material.config';
import { HashtagListComponent } from './components/hashtag-list/hashtag-list.component';
import { MeetupVerificationService } from '../authorized/meetup/meetup-verification/meetup-verification.component';

// const declarationList = [];
const importList = [RouterModule, MaterialModule];
const exportList = [MaterialModule];

@NgModule({
  // If you make a new component in shared folder
  // ...declarationList
  declarations: [HashtagListComponent],
  imports: [...importList, CommonModule],
  // If components needs to be used outside of shared folder then add it here
  exports: [...exportList, HashtagListComponent],
})
export class SharedModule {}
