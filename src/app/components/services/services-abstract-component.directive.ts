import {
  Component,
  Directive,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewEncapsulation
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as Sentry from '@sentry/browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { combineLatest, of, Subscription } from 'rxjs';
import { EventImporterFIT } from '@sports-alliance/sports-lib/lib/events/adapters/importers/fit/importer.fit';
import { User } from '@sports-alliance/sports-lib/lib/users/user';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { switchMap, take, tap } from 'rxjs/operators';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { UserServiceMetaInterface } from '@sports-alliance/sports-lib/lib/users/user.service.meta.interface';
import { Auth2ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth2-service-token.interface';
import { ServiceNames } from '@sports-alliance/sports-lib/lib/meta-data/event-meta-data.interface';
import { Auth1ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth1-service-token.interface';
import { AppFileService } from '../../services/app.file.service';
import { AppWindowService } from '../../services/app.window.service';
import { AppUserService } from '../../services/app.user.service';
import { AppAuthService } from '../../authentication/app.auth.service';
import { AppEventService } from '../../services/app.event.service';


@Directive()
export abstract class ServicesAbstractComponentDirective implements OnInit, OnDestroy, OnChanges {
  public abstract serviceName: ServiceNames;

  @Input() user: User;
  @Input() isGuest: boolean;
  public isLoading = false;
  public serviceTokens: Auth2ServiceTokenInterface[] | Auth1ServiceTokenInterface[];
  public serviceMeta: UserServiceMetaInterface
  public selectedTabIndex = 0;
  public serviceNames = ServiceNames;
  public isConnecting = false;


  protected serviceDataSubscription: Subscription;

  constructor(protected http: HttpClient,
              protected fileService: AppFileService,
              protected afa: AngularFireAnalytics,
              protected eventService: AppEventService,
              protected authService: AppAuthService,
              protected userService: AppUserService,
              protected router: Router,
              protected route: ActivatedRoute,
              protected windowService: AppWindowService,
              protected snackBar: MatSnackBar) {
  }

  async ngOnChanges() {
    this.isLoading = false;

    // Only user can change
    if (this.serviceDataSubscription) {
      this.serviceDataSubscription.unsubscribe()
    }
    // Noop if no user
    if (!this.user || this.isGuest) {
      return;
    }
    this.isLoading = true;
    this.serviceDataSubscription = combineLatest([
      this.userService.getServiceToken(this.user, this.serviceName),
      this.userService
        .getUserMetaForService(this.user, this.serviceName),
    ]).pipe(tap((results) => {
      if (!results) {
        this.serviceTokens = null;
        this.serviceMeta = null;
        return;
      }
      this.serviceTokens = results[0];
      this.serviceMeta = results[1];
    })).subscribe(async (results) => {
      const serviceName = this.route.snapshot.queryParamMap.get('serviceName');
      const shouldConnect = this.route.snapshot.queryParamMap.get('connect');
      if (!serviceName || serviceName !== this.serviceName) {
        this.isLoading = false;
        return;
      }
      if (!shouldConnect || this.isConnecting) {
        this.isLoading = false;
        return;
      }
      this.isConnecting = true;
      try {
        await this.requestAndSetToken(this.route.snapshot.queryParamMap)
        this.afa.logEvent('connected_to_service', {serviceName: this.serviceName});
        this.snackBar.open(`Successfully connected to ${this.serviceName}`, null, {
          duration: 10000,
        });
      } catch (e) {
        Sentry.captureException(e);
        this.snackBar.open(`Could not connect due to ${e.message}`, null, {
          duration: 10000,
        });
      } finally {
        this.isLoading = false;
        this.isConnecting = false;
        await this.router.navigate(['services'], { queryParams: { serviceName: serviceName }, queryParamsHandling: '' });
      }
    });
  }

  async ngOnInit() {
  }

  async connectWithService(event) {
    this.isLoading = true;
    try {
      const tokenAndURI = await this.userService.getCurrentUserServiceTokenAndRedirectURI(this.serviceName);
      // Get the redirect url for the unsigned token created with the post
      this.windowService.windowRef.location.href = this.buildRedirectURIFromServiceToken(tokenAndURI);
    } catch (e) {
      Sentry.captureException(e);
      this.snackBar.open(`Could not connect to ${this.serviceName} due to ${e.message}`, null, {
        duration: 5000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async deauthorizeService(event) {
    this.isLoading = true;
    try {
      await this.userService.deauthorizeService(this.serviceName);
      this.snackBar.open(`Disconnected successfully`, null, {
        duration: 2000,
      });
      this.afa.logEvent('disconnected_from_service', {serviceName: this.serviceName});
    } catch (e) {
      Sentry.captureException(e);
      this.snackBar.open(`Could not disconnect due to ${e.message}`, null, {
        duration: 2000,
      });
    }
    this.isLoading = false;
  }

  ngOnDestroy(): void {
    if (this.serviceDataSubscription) {
      this.serviceDataSubscription.unsubscribe();
    }
  }

  abstract isConnectedToService(): boolean;

  abstract buildRedirectURIFromServiceToken(redirectUri: {redirect_uri: string}|{redirect_uri: string, state: string, oauthToken: string}): string

  abstract requestAndSetToken(params: ParamMap)
}
