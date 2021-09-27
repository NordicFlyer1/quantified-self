import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { AppFileService } from '../../services/app.file.service';
import { Subscription } from 'rxjs';
import { AppEventService } from '../../services/app.event.service';
import { AppAuthService } from '../../authentication/app.auth.service';
import { User } from '@sports-alliance/sports-lib/lib/users/user';
import { ActivatedRoute, Router } from '@angular/router';
import { AppUserService } from '../../services/app.user.service';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AppWindowService } from '../../services/app.window.service';
import { Auth2ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth2-service-token.interface';
import { ServiceNames } from '@sports-alliance/sports-lib/lib/meta-data/event-meta-data.interface';


@Component({
  selector: 'app-services',
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.css'],
})
export class ServicesComponent implements OnInit, OnDestroy {
  public suuntoAppLinkFormGroup: FormGroup;
  public isLoading = false;
  public user: User;
  public isGuest: boolean;
  public suuntoAppTokens: Auth2ServiceTokenInterface[];
  public selectedTabIndex = 0;
  public serviceNames = ServiceNames;

  private userSubscription: Subscription;

  constructor(private http: HttpClient, private fileService: AppFileService,
              private afa: AngularFireAnalytics,
              private eventService: AppEventService,
              public authService: AppAuthService,
              private userService: AppUserService,
              private router: Router,
              private route: ActivatedRoute,
              private windowService: AppWindowService,
              private snackBar: MatSnackBar) {
  }

  async ngOnInit() {
    this.isLoading = true;
    this.userSubscription = this.authService.user.subscribe(((user) => {
      this.user = user;
      this.isLoading = false;
      if (!this.user) {
        this.snackBar.open('You must login if you want to use the service features', 'OK', {
          duration: null,
        });
        return
      }
      this.isGuest = this.authService.isGuest();
      if (this.isGuest) {
        this.snackBar.open('You must login with a non-guest account if you want to use the service features', 'OK', {
          duration: null,
        });
        return;
      }

      const indexMap = {
        [ServiceNames.SuuntoApp]: 0,
        [ServiceNames.GarminHealthAPI]: 1,
        [ServiceNames.COROSAPI]: 2,
      }
      this.selectedTabIndex = indexMap[this.route.snapshot.queryParamMap.get('serviceName')] || 0;
    }))

  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}
