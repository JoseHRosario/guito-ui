import { TestBed } from '@angular/core/testing';
import { ApiVersionService } from './api-version-service';

describe('ApiVersionService', () => {
  let service: ApiVersionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiVersionService);
  });

  afterEach(() => {
    service.version.set(undefined);
  });

  it('captures the X-Api-Version response header (rides the single /warm call, issue #59)', () => {
    service.captureFromResponse(
      new Response('{}', { status: 200, headers: { 'X-Api-Version': '0.1.0-beta.7+20261003T120000Z.abc1234' } }),
    );
    expect(service.version()).toBe('0.1.0-beta.7+20261003T120000Z.abc1234');
  });

  it('stays undefined when the header is missing (pre-#75 API deployed)', () => {
    service.captureFromResponse(new Response('{}', { status: 200 }));
    expect(service.version()).toBeUndefined();
  });

  it('stays undefined on an empty header string', () => {
    service.captureFromResponse(new Response('{}', { status: 200, headers: { 'X-Api-Version': '' } }));
    expect(service.version()).toBeUndefined();
  });
});