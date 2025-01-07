import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetupVerificationModalComponent } from './meetup-verification-modal.component';

describe('MeetupVerificationModalComponent', () => {
  let component: MeetupVerificationModalComponent;
  let fixture: ComponentFixture<MeetupVerificationModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetupVerificationModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetupVerificationModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
