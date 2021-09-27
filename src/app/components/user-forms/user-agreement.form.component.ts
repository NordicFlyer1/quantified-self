import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, Input, OnInit} from '@angular/core';
import {FormBuilder, FormControl, FormGroup, FormGroupDirective, NgForm, Validators} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as Sentry from '@sentry/browser';
import {Privacy} from '@sports-alliance/sports-lib/lib/privacy/privacy.class.interface';
import {User} from '@sports-alliance/sports-lib/lib/users/user';
import {AppUserService} from '../../services/app.user.service';
import {AppAuthService} from '../../authentication/app.auth.service';
import {Router} from '@angular/router';
import {AngularFireAnalytics} from '@angular/fire/compat/analytics';
import { Auth2ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth2-service-token.interface';


@Component({
  selector: 'app-user-agreement-form',
  templateUrl: './user-agreement.form.component.html',
  styleUrls: ['./user-agreement.form.component.css'],
  providers: [],
})


export class UserAgreementFormComponent implements OnInit {

  public privacy = Privacy;
  public user: User;
  public originalValues: {
    displayName: string;
  };

  public userFormGroup: FormGroup;
  private readonly signInMethod: string;

  constructor(
    public dialogRef: MatDialogRef<UserAgreementFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private userService: AppUserService,
    private authService: AppAuthService,
    private snackBar: MatSnackBar,
    private router: Router,
    private afa: AngularFireAnalytics,
  ) {
    this.user = data.user; // Perhaps move to service?
    this.signInMethod = data.signInMethod;
    if (!this.user || !this.signInMethod) {
      throw new Error('Component needs user');
    }
  }

  ngOnInit(): void {
    this.userFormGroup = new FormGroup({
      acceptPrivacyPolicy: new FormControl(this.user.acceptedPrivacyPolicy, [
        Validators.requiredTrue,
        // Validators.minLength(4),
      ]),
      acceptDataPolicy: new FormControl(this.user.acceptedDataPolicy, [
        Validators.requiredTrue,
        // Validators.minLength(4),
      ]),
      acceptTrackingPolicy: new FormControl(this.user.acceptedTrackingPolicy, [
        Validators.requiredTrue,
        // Validators.minLength(4),
      ]),
      acceptDiagnosticsPolicy: new FormControl(this.user.acceptedDiagnosticsPolicy, [
        Validators.requiredTrue,
        // Validators.minLength(4),
      ]),

      // 'alterEgo': new FormControl(this.hero.alterEgo),
      // 'power': new FormControl(this.hero.power, Validators.required)
    });
  }

  hasError(field: string) {
    return (!this.userFormGroup.get(field).valid && this.userFormGroup.get(field).touched);
  }

  async onSubmit(event) {
    event.preventDefault();
    if (!this.userFormGroup.valid) {
      this.validateAllFormFields(this.userFormGroup);
      return;
    }
    try {
      this.user.acceptedDataPolicy = true;
      this.user.acceptedPrivacyPolicy = true;
      this.user.acceptedTrackingPolicy = true;
      this.user.acceptedDiagnosticsPolicy = true;
      const dbUser = await this.userService.createOrUpdateUser(this.user);
      this.snackBar.open('User updated', null, {
        duration: 2000,
      });
      this.afa.logEvent('sign_up', {method: this.signInMethod});
      await this.router.navigate(['dashboard']);
      this.snackBar.open(`Thanks for signing in ${dbUser.displayName || 'guest'}!`, null, {
        duration: 2000,
      });
    } catch (e) {
      // debugger;
      this.snackBar.open('Could not update user', null, {
        duration: 2000,
      });
      Sentry.captureException(e);
    } finally {
      this.dialogRef.close()
    }
  }

  validateAllFormFields(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        control.markAsTouched({onlySelf: true});
      } else if (control instanceof FormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }

  close(event) {
    event.stopPropagation();
    event.preventDefault();
    this.dialogRef.close();
  }
}
