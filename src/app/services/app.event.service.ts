import {Injectable, OnDestroy} from '@angular/core';
import {EventLocalStorageService} from './storage/app.event.local.storage.service';
import {GeoLocationInfoService} from './geo-location/app.geo-location-info.service';
import {WeatherUndergroundWeatherService} from './weather/app.weather-underground.weather.service';
import {EventInterface} from 'quantified-self-lib/lib/events/event.interface';
import {GeoLocationInfo} from 'quantified-self-lib/lib/geo-location-info/geo-location-info';
import {Weather} from 'quantified-self-lib/lib/weather/app.weather';
import {DataPositionInterface} from 'quantified-self-lib/lib/data/data.position.interface';
import {EventImporterJSON} from 'quantified-self-lib/lib/events/adapters/importers/json/importer.json';
import {combineLatest, merge, EMPTY, of, Observable, Observer, from} from 'rxjs';
import {
  AngularFirestore,
  AngularFirestoreCollection,
  DocumentChangeAction,
  QueryDocumentSnapshot,
} from '@angular/fire/firestore';
import {bufferCount, catchError, concatMap, map, mergeMap, reduce, switchMap} from 'rxjs/operators';
import {AngularFireStorage} from '@angular/fire/storage';
import {firestore} from 'firebase/app';
import * as Pako from 'pako';
import {getSize} from 'quantified-self-lib/lib/events/utilities/event.utilities';
import {EventJSONInterface} from 'quantified-self-lib/lib/events/event.json.interface';
import {ActivityJSONInterface} from 'quantified-self-lib/lib/activities/activity.json.interface';
import {ActivityInterface} from 'quantified-self-lib/lib/activities/activity.interface';
import {StreamInterface} from 'quantified-self-lib/lib/streams/stream.interface';
import {Log} from 'ng2-logger/browser';
import * as Raven from 'raven-js';
import {fromPromise} from 'rxjs/internal-compatibility';

@Injectable()
export class EventService implements OnDestroy {

  protected logger = Log.create('EventService');

  constructor(private eventLocalStorageService: EventLocalStorageService,
              private storage: AngularFireStorage,
              private weatherService: WeatherUndergroundWeatherService,
              private afs: AngularFirestore,
              private geoLocationInfoService: GeoLocationInfoService) {
  }

  public getEvent(eventID: string): Observable<EventInterface> {
    // See
    // https://stackoverflow.com/questions/42939978/avoiding-nested-subscribes-with-combine-latest-when-one-observable-depends-on-th
    return combineLatest(
      this.afs.collection("events").doc(eventID).snapshotChanges().pipe(
        map(eventSnapshot => {
          // debugger;
          return EventImporterJSON.getEventFromJSON(<EventJSONInterface>eventSnapshot.payload.data()).setID(eventID);
        })),
      this.getActivities(eventID),
    ).pipe(catchError((error) => {
      // debugger;
      this.logger.error(error);
      Raven.captureException(error);
      return of([])
    })).pipe(map(([event, activities]) => {
      // debugger;
      event.clearActivities();
      activities.forEach((activity) => event.addActivity(activity));
      return event;
    })).pipe(catchError((error) => {
      // debugger;
      Raven.captureException(error);
      this.logger.error(error);
      return of(void 0); // @todo is this the best we can do?
    }))
  }

  public getEvents(): Observable<EventInterface[]> {
    return this.afs.collection("events").snapshotChanges().pipe(map((eventSnapshots) => {
      return eventSnapshots.reduce((eventIDS, eventSnapshot) => {
        eventIDS.push(eventSnapshot.payload.doc.id);
        return eventIDS;
      }, []);
    })).pipe(switchMap((eventIDS) => {
      // Should check if there are event ids else not return
      // debugger;
      if (!eventIDS.length) {
        return of([]);
      }
      return combineLatest(eventIDS.map((eventID) => {
        return this.getEvent(eventID);
      }))
    }))
  }

  public getActivities(eventID: string): Observable<ActivityInterface[]> {
    return this.afs.collection("events").doc(eventID).collection('activities').snapshotChanges().pipe(
      map(activitySnapshots => {
        return activitySnapshots.reduce((activitiesArray: ActivityInterface[], activitySnapshot) => {
          activitiesArray.push(EventImporterJSON.getActivityFromJSON(<ActivityJSONInterface>activitySnapshot.payload.doc.data()).setID(activitySnapshot.payload.doc.id));
          return activitiesArray;
        }, []);
      }),
    )
  }

  public getAllStreams(eventID: string, activityID: string): Observable<StreamInterface[]> {
    return this.afs
      .collection('events')
      .doc(eventID)
      .collection('activities')
      .doc(activityID)
      .collection('streams')
      .snapshotChanges()
      .pipe(map((streamSnapshots) => {
        return this.processStreamSnapshots(streamSnapshots);
      }))
  }

  public getStreams(eventID: string, activityID: string, types: string[]): Observable<StreamInterface[]> {
    return combineLatest.apply(this, types.map((type) => {
      return this.afs
        .collection('events')
        .doc(eventID)
        .collection('activities')
        .doc(activityID)
        .collection('streams', ref => ref.where('type', '==', type))
        .snapshotChanges()
        .pipe(map((streamSnapshots) => { // @todo should be reduce
          return this.processStreamSnapshots(streamSnapshots)[0] // Get the first element of the return
        }))                                                      // since the return with equality on the query should only fetch one afaik in my model
    })).pipe(map((streams: StreamInterface[]) => {
      return streams.filter((stream) => !!stream)
    }))
  }

  private processStreamSnapshots(streamSnapshots: DocumentChangeAction<firestore.DocumentData>[]): StreamInterface[] {
    return streamSnapshots.reduce((streamArray, streamSnapshot) => {
      streamArray.push(EventImporterJSON.getStreamFromJSON({
        type: <string>streamSnapshot.payload.doc.data().type,
        data: this.getStreamDataFromBlob(streamSnapshot.payload.doc.data().data),
      }));
      return streamArray
    }, [])
  }

  public async setEvent(event: EventInterface): Promise<void[]> {
    return new Promise<void[]>(async (resolve, reject) => {
      const streamPromises: Promise<void>[] = [];
      event.setID(event.getID() || this.afs.createId());
      event.getActivities()
        .forEach((activity) => {
          activity.setID(activity.getID() || this.afs.createId());
          streamPromises.push(this.afs.collection('events').doc(event.getID()).collection('activities').doc(activity.getID()).set(activity.toJSON()));
          activity.getAllStreams().forEach((stream) => {
            this.logger.info(`Steam ${stream.type} has size of GZIP ${getSize(firestore.Blob.fromBase64String(btoa(Pako.gzip(JSON.stringify(stream.data), {to: 'string'}))))}`);
            streamPromises.push(this.afs
              .collection('events')
              .doc(event.getID())
              .collection('activities')
              .doc(activity.getID())
              .collection('streams')
              .doc(stream.type) // @todo check this how it behaves
              .set({
                type: stream.type,
                data: this.getBlobFromStreamData(stream.data),
              }))
          });
        });
      try {
        await Promise.all(streamPromises);
        await this.afs.collection('events').doc(event.getID()).set(event.toJSON());
        resolve()
      } catch (e) {
        Raven.captureException(e);
        // Try to delete the parent entity and all subdata
        await this.deleteEvent(event.getID());
        reject('Something went wrong')
      }
    })
  }

  public async deleteEvent(eventID: string): Promise<boolean> {
    const activityDeletePromises: Promise<boolean>[] = [];
    const queryDocumentSnapshots = await this.afs
      .collection('events')
      .doc(eventID).collection('activities').ref.get();
    queryDocumentSnapshots.docs.forEach((queryDocumentSnapshot) => {
      activityDeletePromises.push(this.deleteActivity(eventID, queryDocumentSnapshot.id))
    });
    await Promise.all(activityDeletePromises);
    await this.afs
      .collection('events')
      .doc(eventID).delete();
    this.logger.info(`Deleted event ${eventID}`);
    return true;
  }

  public async deleteActivity(eventID: string, activityID: string): Promise<boolean> {
    // @todo add try catch etc
    await this.deleteAllStreams(eventID, activityID);
    await this.afs
      .collection('events')
      .doc(eventID)
      .collection('activities')
      .doc(activityID).delete();
    this.logger.info(`Deleted activity ${activityID} for event ${eventID}`);
    return true;
  }

  public async deleteAllStreams(eventID, activityID): Promise<number> {
    const numberOfStreamsDeleted = await this.deleteAllDocsFromCollections([
      this.afs.collection('events').doc(eventID).collection('activities').doc(activityID).collection('streams'),
    ]);
    this.logger.info(`Deleted ${numberOfStreamsDeleted} streams for event: ${eventID} and activity ${activityID}`);
    return numberOfStreamsDeleted
  }

  // From https://github.com/angular/angularfire2/issues/1400
  private async deleteAllDocsFromCollections(collections: AngularFirestoreCollection[]) {
    let totalDeleteCount = 0;
    const batchSize = 500;
    return new Promise<number>((resolve, reject) =>
      from(collections)
        .pipe(concatMap(collection => fromPromise(collection.ref.get())))
        .pipe(concatMap(q => from(q.docs)))
        .pipe(bufferCount(batchSize))
        .pipe(concatMap((docs) => Observable.create((o: Observer<number>) => {
          const batch = this.afs.firestore.batch();
          docs.forEach(doc => batch.delete(doc.ref));
          batch.commit()
            .then(() => {
              o.next(docs.length);
              o.complete()
            })
            .catch(e => o.error(e))
        })))
        .subscribe(
          (batchDeleteCount: number) => totalDeleteCount += batchDeleteCount,
          e => reject(e),
          () => resolve(totalDeleteCount),
        ))
  }

  /**
   * Add geolocation and weather info to an event
   * @param {EventInterface} event
   * @return {Promise<EventInterface>}
   * @todo Write tests!
   */
  public addGeoLocationAndWeatherInfo(event: EventInterface): Promise<EventInterface> {
    return new Promise(((resolve, reject) => {
      // Find the activities with positional data
      const activitiesWithPosition = event.getActivities().filter((activity) => {
        return event.getPointsWithPosition(void 0, void 0, [activity]).length
      });
      // Create their promises
      const activitiesPromises = activitiesWithPosition.reduce((activityPromises, activity) => {
        activityPromises.push(this.geoLocationInfoService.getGeoLocationInfo(
          <DataPositionInterface>event.getPointsWithPosition(void 0, void 0, [activity])[0].getPosition(),
        ));
        activityPromises.push(this.weatherService.getWeather(
          <DataPositionInterface>event.getPointsWithPosition(void 0, void 0, [activity])[0].getPosition(), activity.startDate,
        ));
        return activityPromises;
      }, []);

      // Wait for all
      Promise.all(activitiesPromises.map(p => p.catch(e => e))).then(results => {
        if (!results || !results.length) {
          resolve(event);
        }
        // For each activity get 2 data from the results
        let i = 0;
        activitiesWithPosition.forEach((activity, index) => {
          if (results[index + i] instanceof GeoLocationInfo) {
            activity.geoLocationInfo = <GeoLocationInfo> results[index + i];
          }
          if (results[index + i + 1] instanceof Weather) {
            activity.weather = <Weather> results[index + i + 1];
          }
          i += 2;
        });
        resolve(event);
      }).catch((e) => {
        reject(event);
      });
    }));
  }

  private getBlobFromStreamData(streamData: number[]): firestore.Blob {
    return firestore.Blob.fromBase64String(btoa(Pako.gzip(JSON.stringify(streamData), {to: 'string'})))
  }

  private getStreamDataFromBlob(blob: firestore.Blob): number[] {
    return JSON.parse(Pako.ungzip(atob(blob.toBase64()), {to: 'string'}));
  }

  ngOnDestroy() {
  }

}

// // Save the whole event to a json file
// // Save the points as a json string in storage and link to id etc
// const filePath = event.getID();
// const ref = this.storage.ref(filePath);
// const task = ref.putString(JSON.stringify(event.toJSON()));
//
//
// task.snapshotChanges().pipe(
//     finalize(() => {
//       debugger
//       batch.commit();
//     })
//  )
// .subscribe()

