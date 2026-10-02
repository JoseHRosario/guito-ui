import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';

/** The `GET /Category` wire contract: `{ categories: [{ name }] }`. */
interface CategoryListDto {
  categories?: { name?: string | null }[] | null;
}

/** The deployed API's expense-category list (issue #32; interceptor attaches auth). */
@Injectable({ providedIn: 'root' })
export class CategoryApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Category names in sheet order — the first one is the Create form's default. */
  async list(): Promise<string[]> {
    const response = await firstValueFrom(this.http.get<CategoryListDto>(`${this.env.apiBaseUrl}/Category`));
    return (response.categories ?? []).map((c) => c.name ?? '').filter((name) => name !== '');
  }
}
