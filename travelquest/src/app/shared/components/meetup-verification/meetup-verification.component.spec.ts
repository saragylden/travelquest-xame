import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetupVerificationComponent } from './meetup-verification.component';

describe('MeetupVerificationComponent', () => {
  let component: MeetupVerificationComponent;
  let fixture: ComponentFixture<MeetupVerificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetupVerificationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetupVerificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
