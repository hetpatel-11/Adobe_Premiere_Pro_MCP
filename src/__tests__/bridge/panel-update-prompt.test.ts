import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INSTALL_COMMAND } from '../../utils/update-check.js';
import { loadPanel, PANEL_PATH } from '../helpers/panel.js';

describe('CEP update prompt', () => {
  it('offers an update when latest is newer and not snoozed', () => {
    const { bridge } = loadPanel();

    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.4', 0, 1_000)).toBe(true);
    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.3', 0, 1_000)).toBe(false);
    expect(bridge.shouldOfferUpdate('1.2.3', '1.2.4', 5_000, 1_000)).toBe(false);
    expect(bridge.comparePackageVersions('1.2.10', '1.2.9')).toBe(1);
  });

  it('gives the same terminal command as the server instead of spawning npm', () => {
    const { bridge } = loadPanel();
    const html = readFileSync(join(PANEL_PATH, '..', 'index.html'), 'utf8');

    expect(bridge.updateInstallCommand()).toBe(INSTALL_COMMAND);
    expect(html).toContain('copyUpdateCommand()');
    expect(html).not.toContain('updateNow()');
    expect(html).toContain('updateCopyButton');
  });

  it('copies the command and does not spawn npm', () => {
    const { bridge } = loadPanel();
    const copied: string[] = [];
    bridge.copyTextToClipboard = (text: string) => {
      copied.push(text);
      return true;
    };
    bridge.setUpdateBannerStatus = jest.fn();

    expect(bridge.copyUpdateCommand()).toBe(true);
    expect(copied).toEqual([INSTALL_COMMAND]);
    expect(bridge.setUpdateBannerStatus).toHaveBeenCalledWith(
      'Copied. Paste it in a terminal, then reload this panel.',
    );
    expect(typeof bridge.updateNow).toBe('undefined');
    expect(typeof bridge.resolveCommand).toBe('undefined');
  });
});
