import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component, HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {ActionButtonService} from '../../services/action-buttons/app.action-button.service';
import {ActionButton} from '../../services/action-buttons/app.action-button';
import {EventService} from '../../services/app.event.service';
import {Router} from '@angular/router';
import {MatSnackBar, MatSort, MatSortable, MatTableDataSource} from '@angular/material';
import {SelectionModel} from '@angular/cdk/collections';
import {DatePipe} from '@angular/common';
import {EventInterface} from 'quantified-self-lib/lib/events/event.interface';
import {EventUtilities} from 'quantified-self-lib/lib/events/utilities/event.utilities';
import {first} from 'rxjs/operators';


@Component({
  selector: 'app-event-table',
  templateUrl: './event.table.component.html',
  styleUrls: ['./event.table.component.css'],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class EventTableComponent implements OnChanges, OnInit, OnDestroy, AfterViewInit {
  @Input() events: EventInterface[];
  @ViewChild(MatSort) sort: MatSort;
  data: MatTableDataSource<Object>;
  columns: Array<Object>;
  selection = new SelectionModel(true, []);

  public eventSelectionMap: Map<EventInterface, boolean> = new Map<EventInterface, boolean>();

  constructor(private snackBar: MatSnackBar,
              private eventService: EventService,
              private actionButtonService: ActionButtonService,
              private router: Router, private  datePipe: DatePipe) {
  }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.data.sort = this.sort;
    this.data.sort.sort(<MatSortable>{
        id: 'Date',
        start: 'desc',
      },
    );
  }

  ngOnChanges(): void {
    const data = this.events.reduce((eventArray, event) => {
      eventArray.push({
        Checkbox: event,
        Date: this.datePipe.transform(event.startDate || null, 'd MMM yy HH:mm'),
        Activities: this.getUniqueStringWithMultiplier(event.getActivities().map((activity) => activity.type)),
        Distance: event.getDistance() ? event.getDistance().getDisplayValue() + event.getDistance().getDisplayUnit() : '-- ',
        Duration: event.getDuration() ? event.getDuration().getDisplayValue() : '--',
        Device:
          this.getUniqueStringWithMultiplier(event.getActivities().map((activity) => activity.creator.name)),
        Actions:
        event,
      })
      ;
      return eventArray;
    }, []);
    this.columns = Object.keys(data[0]);
    this.data = new MatTableDataSource(data);
    // @todo combine this with after view init
    if (this.sort) {
      this.data.sort = this.sort;
      this.data.sort.sort(<MatSortable>{
          id: 'Date',
          start: 'desc',
        },
      );
    }
  }

  checkBoxClick(row) {
    this.selection.toggle(row);
    this.updateActionButtonService();
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.data.data.length;
    return numSelected === numRows;
  }


  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.data.data.forEach(row => this.selection.select(row));
    this.updateActionButtonService();
  }


  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // MatTableDataSource defaults to lowercase matches
    this.data.filter = filterValue;
  }

  getColumnIcon(columnName): string {
    switch (columnName) {
      case 'Distance':
        return 'trending_flat';
      case 'Duration':
        return 'timer';
      case 'Date':
        return 'date_range';
      case 'Location':
        return 'location_on';
      case 'Device':
        return 'watch';
      case 'Name':
        return 'font_download';
      case 'Activities':
        return 'filter_none';
      default:
        return null;
    }
  }

  private updateActionButtonService() {
    // Remove all at start and add progressively
    this.actionButtonService.removeActionButton('mergeEvents');
    this.actionButtonService.removeActionButton('deleteEvents');

    if (this.selection.selected.length > 1) {
      this.actionButtonService.addActionButton('mergeEvents', new ActionButton(
        'compare_arrows',
        () => {
          this.actionButtonService.removeActionButton('mergeEvents');
          // First fetch them complete
          const promises: Promise<EventInterface>[] = [];
          this.selection.selected.forEach((selected) => {
            promises.push(this.eventService.getEventActivitiesAndStreams(selected.Checkbox.getID()).pipe(first()).toPromise());
          });
          Promise.all(promises).then((events) => {
            const mergedEvent = EventUtilities.mergeEvents(events);
            this.eventService.setEvent(mergedEvent).then(() => {
              this.actionButtonService.removeActionButton('mergeEvents');
              this.eventService.setEvent(mergedEvent);
              this.eventSelectionMap.clear();
              this.selection.clear();
              this.router.navigate(['/eventDetails'], {
                queryParams: {
                  eventID: mergedEvent.getID(),
                  tabIndex: 0,
                },
              }).then(() => {
                this.snackBar.open('Events merged', null, {
                  duration: 5000,
                });
              });
            });
          })
        },
        'material',
      ));
    }

    if (this.selection.selected.length > 0) {
      this.actionButtonService.addActionButton('deleteEvents', new ActionButton(
        'delete',
        () => {
          this.actionButtonService.removeActionButton('deleteEvents');
          this.actionButtonService.removeActionButton('mergeEvents');
          this.selection.selected.map(selected => selected.Checkbox).forEach((event) => this.eventService.deleteEvent(event.getID));
          this.eventSelectionMap.clear();
          this.selection.clear();
          this.snackBar.open('Events deleted', null, {
            duration: 5000,
          });
        },
        'material',
      ));
    }
  }

  private getUniqueStringWithMultiplier(arrayOfStrings: string[]) {
    const uniqueObject = arrayOfStrings.reduce((uniqueObj, activityType, index) => {
      if (!uniqueObj[activityType]) {
        uniqueObj[activityType] = 1;
      } else {
        uniqueObj[activityType] += 1;
      }
      return uniqueObj;
    }, {});
    return Object.keys(uniqueObject).reduce((uniqueArray, key, index, object) => {
      if (uniqueObject[key] === 1) {
        uniqueArray.push(key);
      } else {
        uniqueArray.push(uniqueObject[key] + ' x ' + key);
      }
      return uniqueArray;
    }, []).join(', ');
  }

  ngOnDestroy() {
    this.actionButtonService.removeActionButton('mergeEvents');
    this.actionButtonService.removeActionButton('deleteEvents');
  }
}
