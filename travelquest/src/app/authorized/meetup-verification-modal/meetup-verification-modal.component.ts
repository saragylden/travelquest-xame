import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-meetup-verification-modal',
  templateUrl: './meetup-verification-modal.component.html',
  styleUrls: ['./meetup-verification-modal.component.scss'],
})
export class MeetupVerificationModalComponent {
  constructor(
    public dialogRef: MatDialogRef<MeetupVerificationModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { sender: string }
  ) {}

  closeDialog(result: boolean): void {
    this.dialogRef.close(result);
  }
}
