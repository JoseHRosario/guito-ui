import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Shell } from './shell/shell';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<g-shell />',
  imports: [Shell],
})
export class App {}
