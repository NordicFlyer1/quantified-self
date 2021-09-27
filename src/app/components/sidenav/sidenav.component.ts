import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router} from '@angular/router';
import {EventInterface} from '@sports-alliance/sports-lib/lib/events/event.interface';
import {AppAuthService} from '../../authentication/app.auth.service';
import {AppSideNavService} from '../../services/side-nav/app-side-nav.service';
import { AppThemes } from '@sports-alliance/sports-lib/lib/users/settings/user.app.settings.interface';
import { Subscription } from 'rxjs';
import { User } from '@sports-alliance/sports-lib/lib/users/user';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AppWindowService } from '../../services/app.window.service';
import { AppThemeService } from '../../services/app.theme.service';
import { AppUserService } from '../../services/app.user.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sidenav',
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.css'],
})
export class SideNavComponent implements OnInit, OnDestroy {

  public events: EventInterface[] = [];
  public appVersion = environment.appVersion;

  public user: User;

  public appTheme: AppThemes
  public appThemes = AppThemes;

  private userSubscription: Subscription
  private themeSubscription: Subscription

  constructor(
    public authService: AppAuthService,
    public userService: AppUserService,
    public sideNav: AppSideNavService,
    public themeService: AppThemeService,
    private windowService: AppWindowService,
    private afa: AngularFireAnalytics,
    private snackBar: MatSnackBar,
    private router: Router) {
  }

  ngOnInit() {
    this.themeSubscription = this.themeService.getAppTheme().subscribe(theme => {
      this.appTheme = theme
    })
    this.userSubscription = this.authService.user.subscribe((user) => {
      this.user = user;
      // if (!user) {
      //   return
      // }
    })
  }

  async donate() {
    this.afa.logEvent('donate_click', {method: 'PayPal'});
    window.open('https://paypal.me/DKanellopoulos');
  }

  async becomeAPatron() {
    this.afa.logEvent('become_a_patron_click');
    window.open('https://www.patreon.com/dimitrioskanellopoulos');
  }

  async gitHubSponsor() {
    this.afa.logEvent('github_sponsor');
    window.open('https://github.com/sponsors/jimmykane?utm_source=qs');
  }

  async gitHubStar() {
    this.afa.logEvent('github_star');
    window.open('https://github.com/jimmykane/quantified-self/');
  }

  async logout() {
    this.afa.logEvent('logout', {});
    this.router.navigate(['/']).then(async () => {
      await this.authService.signOut();
      localStorage.clear();
      this.windowService.windowRef.location.reload();
      this.snackBar.open('Signed out', null, {
        duration: 2000,
      });
    });
  }

  ngOnDestroy(): void {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

}
