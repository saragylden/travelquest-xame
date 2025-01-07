import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'travelquest-meetup-dialog',
  standalone: true, // Keep it standalone
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './meetup-dialog.component.html',
  styleUrls: ['./meetup-dialog.component.scss'],
})
export class MeetupDialogComponent implements OnInit {
  requestId: string | null = null; // Store the request ID
  requestStatus: string = 'pending'; // Default status
  isReceiver: boolean = false; // Check if this is the receiver

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: { name: string; requestId: string; isReceiver: boolean },
    private dialogRef: MatDialogRef<MeetupDialogComponent>,
    private firestore: Firestore,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.requestId = this.data.requestId;
    this.isReceiver = this.data.isReceiver;

    // Fetch the current status of the request if it's the receiver's dialog
    if (this.isReceiver && this.requestId) {
      this.checkRequestStatus(this.requestId);
    }
  }

  private async checkRequestStatus(requestId: string): Promise<void> {
    try {
      const requestRef = doc(this.firestore, `meetupRequests/${requestId}`);
      const snapshot = await getDoc(requestRef);

      if (snapshot.exists()) {
        const requestData = snapshot.data();
        this.requestStatus = requestData?.['status'] || 'pending';
      }
    } catch (error) {
      console.error('Error fetching request status:', error);
    }
  }

  respond(response: string): void {
    if (!this.requestId) return;

    // Handle the response from the receiver (either accept or reject)
    this.updateRequestStatus(response);

    // Close the dialog and pass the response
    this.dialogRef.close(response);
  }

  private async updateRequestStatus(status: string): Promise<void> {
    try {
      const requestRef = doc(
        this.firestore,
        `meetupRequests/${this.requestId}`
      );
      await updateDoc(requestRef, { status });

      // Show a snackbar with the result
      if (status === 'accepted') {
        this.snackBar.open('Meetup request accepted.', 'Close', {
          duration: 3000,
        });
      } else {
        this.snackBar.open('Meetup request rejected.', 'Close', {
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error updating request status:', error);
      this.snackBar.open('Error updating request status.', 'Close', {
        duration: 3000,
      });
    }
  }
}
