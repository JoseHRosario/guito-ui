import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { ApiVersionService } from '../../../core/api-version/api-version-service';
import { BankConnectionCard } from '../components/bank-connection-card';

/** Build-stamp fragment: semver core + muted 'built …' line (approved frame, issue #51). */
interface VersionParts {
  semver: string;
  built: string | null;
}

/**
 * Issue #51: version-only Settings page (approved Figma frames
 * 'Settings — Mobile' 3180:9791 / 'Settings — Desktop' 3182:9731).
 * App version comes from the build stamp (APP_ENVIRONMENT); API version was
 * captured once at bootstrap from the X-Api-Version response header
 * (core/api-version) — absent means the API didn't answer or predates
 * guito-api#75, shown as an explicit unavailable line.
 */
@Component({
  selector: 'g-settings-page',
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BankConnectionCard],
})
export class SettingsPage {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly apiVersions = inject(ApiVersionService);

  protected readonly appParts = computed(() => splitStamp(this.env.version));
  protected readonly apiVersion = this.apiVersions.version;
  protected readonly toParts = splitStamp;
}

function splitStamp(stamp: string): VersionParts {
  const plus = stamp.indexOf('+');
  if (plus < 0) return { semver: stamp, built: null };
  const semver = stamp.slice(0, plus);
  const meta = stamp.slice(plus + 1); // YYYYMMDDTHHMMSSZ.<shortsha>
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.([0-9a-f]+)$/.exec(meta);
  const built = m
    ? `built ${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC · ${m[7]}`
    : `built ${meta}`;
  return { semver, built };
}
