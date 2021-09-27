import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { AppUserService } from '../../../../services/app.user.service';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { TileActionsAbstractDirective } from '../tile-actions-abstract.directive';
import { MapThemes, MapTypes } from '@sports-alliance/sports-lib/lib/users/settings/user.map.settings.interface';
import { TileMapSettingsInterface } from '@sports-alliance/sports-lib/lib/tiles/tile.settings.interface';

@Component({
  selector: 'app-tile-map-actions',
  templateUrl: './tile.map.actions.component.html',
  styleUrls: ['../tile.actions.abstract.css', './tile.map.actions.component.css'],
  providers: [],
})
export class TileMapActionsComponent extends TileActionsAbstractDirective implements OnInit, OnChanges {
  @Input() mapType: MapTypes;
  @Input() mapTheme: MapThemes;
  @Input() showHeatMap: boolean;
  @Input() clusterMarkers: boolean;

  public mapTypes = MapTypes;
  public mapThemes = MapThemes;
  public iconColor: string;

  constructor(
    userService: AppUserService,
    afa: AngularFireAnalytics) {
    super(userService, afa);
  }


  ngOnInit(): void {
    if (!this.user) {
      throw new Error('Component needs user');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    switch (this.mapTheme) {
      case MapThemes.Desert:
      case MapThemes.Dark:
      case MapThemes.Black:
      case MapThemes.MidnightCommander:
      case MapThemes.Night:
      case MapThemes.DarkElectric :
        this.iconColor = '#FFFFFF';
        break;
      default:
        this.iconColor = '#000000'
        break;
    }
  }

  async changeMapType(event) {
    this.afa.logEvent('dashboard_tile_action', {method: 'changeMapType'});
    (<TileMapSettingsInterface>this.user.settings.dashboardSettings.tiles.find(tile => tile.order === this.order)).mapType = event.value;
    return this.userService.updateUserProperties(this.user, {settings: this.user.settings})
  }

  async changeMapTheme(event) {
    this.afa.logEvent('dashboard_tile_action', {method: 'changeMapTheme'});
    (<TileMapSettingsInterface>this.user.settings.dashboardSettings.tiles.find(tile => tile.order === this.order)).mapTheme = event.value;
    return this.userService.updateUserProperties(this.user, {settings: this.user.settings})
  }

  async switchHeatMap(event) {
    this.afa.logEvent('dashboard_tile_action', {method: 'switchHeatmap'});
    (<TileMapSettingsInterface>this.user.settings.dashboardSettings.tiles.find(tile => tile.order === this.order)).showHeatMap = this.showHeatMap;
    return this.userService.updateUserProperties(this.user, {settings: this.user.settings})
  }

  async switchClusterMarkers(event) {
    this.afa.logEvent('dashboard_tile_action', {method: 'switchClusterMarkers'});
    (<TileMapSettingsInterface>this.user.settings.dashboardSettings.tiles.find(tile => tile.order === this.order)).clusterMarkers = this.clusterMarkers;
    return this.userService.updateUserProperties(this.user, {settings: this.user.settings})
  }

}



