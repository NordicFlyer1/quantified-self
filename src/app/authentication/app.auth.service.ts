import { Injectable, OnDestroy } from '@angular/core';
import { Observable, of, Subscription } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { User } from '@sports-alliance/sports-lib/lib/users/user';
import { AppUserService } from '../services/app.user.service';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { LocalStorageService } from '../services/storage/app.local.storage.service';
import firebase from 'firebase/compat/app';
import 'firebase/auth';


@Injectable({
  providedIn: 'root'
})
export class AppAuthService implements OnDestroy {
  user: Observable<User | null>;
  // store the URL so we can redirect after logging in
  redirectUrl: string;
  private authState = null;
  private guest: boolean;
  private userSubscription: Subscription;

  constructor(
    private afAuth: AngularFireAuth,
    private afs: AngularFirestore,
    private afa: AngularFireAnalytics,
    private userService: AppUserService,
    private snackBar: MatSnackBar,
    private localStorageService: LocalStorageService
  ) {
    this.user = this.afAuth.authState.pipe(
      switchMap(user => {
        if (user) {
          this.guest = user.isAnonymous;
          return this.userService.getUserByID(user.uid).pipe(map((dbUser: User) => {
            this.authState = !!dbUser;
            if (dbUser) {
              dbUser.creationDate = new Date(user.metadata.creationTime);
              dbUser.lastSignInDate = new Date(user.metadata.lastSignInTime);
            }
            // if (dbUser) {
            //   this.afa.setAnalyticsCollectionEnabled(true);
            // }
            return dbUser;
          }));
        } else {
          this.authState = false;
          return of(null);
        }
      })
    );
  }

  authenticated(): boolean {
    return this.authState;
  }

  isGuest(): boolean {
    return !!this.guest;
  }

  googleLoginWithRedirect() {
    const provider = new firebase.auth.GoogleAuthProvider();
    return this.oAuthLoginWithRedirect(provider);
  }

  githubLoginWithRedirect() {
    const provider = new firebase.auth.GithubAuthProvider();
    return this.oAuthLoginWithRedirect(provider);
  }

  facebookLoginWithRedirect() {
    const provider = new firebase.auth.FacebookAuthProvider();
    return this.oAuthLoginWithRedirect(provider);
  }

  twitterLoginWithRedirect() {
    const provider = new firebase.auth.TwitterAuthProvider();
    return this.oAuthLoginWithRedirect(provider);
  }

  gitHubLoginWithRedirect() {
    const provider = new firebase.auth.GithubAuthProvider();
    return this.oAuthLoginWithRedirect(provider);
  }

  oAuthLoginWithRedirect(provider: any) {
    try {
      return this.afAuth.signInWithRedirect(provider);
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }

  //// Anonymous Auth ////

  async anonymousLogin() {
    try {
      return await this.afAuth.signInAnonymously();
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }

  //// Email/Password Auth ////

  async emailSignUp(email: string, password: string) {
    try {
      return this.afAuth.createUserWithEmailAndPassword(email, password);
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }

  async emailLogin(email: string, password: string) {
    try {
      return this.afAuth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      this.handleError(e);
      throw e;
    }
  }

  // Sends email allowing user to reset password
  resetPassword(email: string) {
    const fbAuth = firebase.auth();
    return fbAuth
      .sendPasswordResetEmail(email)
      .then(() => this.snackBar.open(`Password update email sent`, null, {
        duration: 2000
      }))
      .catch(error => this.handleError(error));
  }

  async signOut(): Promise<void> {
    await this.afAuth.signOut();
    await this.afs.firestore.terminate();
    this.localStorageService.clearAllStorage();
    return this.afs.firestore.clearPersistence();
  }

  ngOnDestroy(): void {
    this.userSubscription.unsubscribe();
  }

  private async getOrInsertUser(user: User) {
    // Check if we have a user
    const databaseUser = await this.userService.getUserByID(user.uid).pipe(take(1)).toPromise();
    if (!databaseUser) {
      return this.userService.createOrUpdateUser(new User(user.uid, user.displayName, user.photoURL));
    }
    return Promise.resolve(databaseUser);
  }

  // If error, console log and notify user
  private handleError(error: Error) {
    console.error(error);
    this.snackBar.open(`Could not login due to error ${error.message}`, null, {
      duration: 2000
    });
  }
}
