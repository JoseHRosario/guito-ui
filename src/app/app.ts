import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Guito');
  protected readonly started = signal(false);

  protected start(): void {
    this.started.set(true);
  }
}
