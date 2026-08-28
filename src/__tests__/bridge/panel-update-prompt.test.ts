import { loadPanel } from '../helpers/panel.js';

describe('CEP update prompt', () => {
  it('offers an update when latest is newer and not snoozed', () => {
    const { bridge } = loadPanel();

    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.4', 0, 1_000)).toBe(true);
    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.3', 0, 1_000)).toBe(false);
    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.4', 5_000, 1_000)).toBe(false);
    expect(bridge.comparePackageVersions('1.2.10', '1.2.9')).toBe(1);
  });
});
