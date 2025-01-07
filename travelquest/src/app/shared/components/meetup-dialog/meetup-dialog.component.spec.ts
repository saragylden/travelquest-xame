import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetupDialogComponent } from './meetup-dialog.component';

describe('MeetupDialogComponent', () => {
  let component: MeetupDialogComponent;
  let fixture: ComponentFixture<MeetupDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetupDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetupDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
