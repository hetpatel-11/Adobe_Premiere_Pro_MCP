import { canonicalizeMcpArgs } from '../../utils/mcp-args.js';

describe('canonicalizeMcpArgs', () => {
  it('copies snake_case keys onto the camelCase names the schemas require', () => {
    expect(canonicalizeMcpArgs({
      sequence_id: 'seq-1',
      clip_id: 'clip-1',
      track_index: 0,
      project_item_id: 'item-1',
    })).toMatchObject({
      sequenceId: 'seq-1',
      clipId: 'clip-1',
      trackIndex: 0,
      projectItemId: 'item-1',
    });
  });

  it('coerces numeric strings on known numeric keys and leaves ids as strings', () => {
    expect(canonicalizeMcpArgs({
      time: '12.5',
      duration: '0.5',
      clipId: '123',
      trackIndex: '2',
    })).toEqual({
      time: 12.5,
      duration: 0.5,
      clipId: '123',
      trackIndex: 2,
    });
  });

  it('does not overwrite a camelCase key that is already present', () => {
    expect(canonicalizeMcpArgs({
      sequenceId: 'canonical',
      sequence_id: 'alias',
    })).toMatchObject({
      sequenceId: 'canonical',
    });
  });

  it('leaves metadata value strings alone even when they look numeric', () => {
    expect(canonicalizeMcpArgs({
      projectItemId: '000f4241',
      key: 'SweepVerifier',
      value: '1788211569358',
    })).toEqual({
      projectItemId: '000f4241',
      key: 'SweepVerifier',
      value: '1788211569358',
    });
  });

  it('still coerces keyframe value strings when no metadata key is present', () => {
    expect(canonicalizeMcpArgs({
      clipId: '000f4244',
      value: '101',
    })).toMatchObject({
      clipId: '000f4244',
      value: 101,
    });
  });

  it('lowercases format enumerations', () => {
    expect(canonicalizeMcpArgs({ format: 'PNG' })).toEqual({ format: 'png' });
  });
});
