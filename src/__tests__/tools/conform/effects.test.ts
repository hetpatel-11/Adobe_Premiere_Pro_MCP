import {
  adaptMotionTransformForResolution,
  buildEffectCopyPlan,
  normalizeEffectSnapshots,
} from '../../../tools/conform/effects.js';

describe('conform effect and Motion transform planning', () => {
  it('converts uniform Motion scale when online media has a higher matching raster', () => {
    const result = adaptMotionTransformForResolution({
      transform: {
        scale: 100,
        position: { x: 960, y: 540, coordinateSpace: 'sequencePixels' },
        rotation: 2,
      },
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 3840, height: 2160 },
    });

    expect(result.transform.scale).toBe(50);
    expect(result.transform.position).toEqual({ x: 960, y: 540, coordinateSpace: 'sequencePixels' });
    expect(result.transform.rotation).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('converts source-pixel Motion position and anchor point for online raster while preserving sequence-pixel position', () => {
    const result = adaptMotionTransformForResolution({
      transform: {
        position: { x: 960, y: 540, coordinateSpace: 'sourcePixels' },
        anchorPoint: { x: 960, y: 540, coordinateSpace: 'sourcePixels' },
        sequencePosition: { x: 960, y: 540, coordinateSpace: 'sequencePixels' },
      },
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 3840, height: 2160 },
    });

    expect(result.transform.position).toEqual({ x: 1920, y: 1080, coordinateSpace: 'sourcePixels' });
    expect(result.transform.anchorPoint).toEqual({ x: 1920, y: 1080, coordinateSpace: 'sourcePixels' });
    expect(result.transform.sequencePosition).toEqual({ x: 960, y: 540, coordinateSpace: 'sequencePixels' });
  });

  it('reports aspect-ratio mismatches instead of pretending Motion conversion is exact', () => {
    const result = adaptMotionTransformForResolution({
      transform: { scale: 100 },
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 4096, height: 2160 },
    });

    expect(result.transform.scale).toBeCloseTo(46.875);
    expect(result.warnings).toContain('sourceAspectRatioMismatch');
  });

  it('normalizes raw snapshot effect summaries into copy-plan source effects', () => {
    const normalized = normalizeEffectSnapshots([
      {
        displayName: 'Motion',
        matchName: 'AE.ADBE Motion',
        properties: [
          { displayName: 'Scale', value: 100 },
          { displayName: 'Position', value: [960, 540] },
        ],
      },
      { componentName: 'Opacity', properties: { Opacity: 75 } },
    ]);

    expect(normalized).toEqual([
      { componentName: 'Motion', matchName: 'AE.ADBE Motion', properties: { Scale: 100, Position: [960, 540] } },
      { componentName: 'Opacity', properties: { Opacity: 75 }, unknownKeyframeProperties: ['Opacity'] },
    ]);
  });

  it('treats object-form snapshot properties as unknown keyframe state unless inspected', () => {
    const [snapshot] = normalizeEffectSnapshots([
      { componentName: 'Motion', properties: { Scale: 100 } },
    ]);

    expect(snapshot).toMatchObject({
      componentName: 'Motion',
      properties: { Scale: 100 },
      unknownKeyframeProperties: ['Scale'],
    });
  });

  it('plans supported built-in effects and reports unsupported third-party components', () => {
    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 3840, height: 2160 },
      sourceEffects: [
        { componentName: 'Motion', properties: { Scale: 100, Position: { x: 960, y: 540, coordinateSpace: 'sequencePixels' } } },
        { componentName: 'Opacity', properties: { Opacity: 75 } },
        { componentName: 'Magic Vendor Effect', properties: { Amount: 42 } },
      ],
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.assignments).toEqual([
      { componentName: 'Motion', propertyName: 'Scale', value: 50 },
      { componentName: 'Motion', propertyName: 'Position', value: { x: 960, y: 540, coordinateSpace: 'sequencePixels' } },
      { componentName: 'Opacity', propertyName: 'Opacity', value: 75 },
    ]);
    expect(result.unsupportedComponents).toEqual(['Magic Vendor Effect']);
  });

  it('refuses Motion copy when source rasters are missing for conversion', () => {
    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      sourceEffects: [
        { componentName: 'Motion', properties: { Scale: 100 } },
        { componentName: 'Opacity', properties: { Opacity: 75 } },
      ],
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.assignments).toEqual([{ componentName: 'Opacity', propertyName: 'Opacity', value: 75 }]);
    expect(result.unsupportedComponents).toContain('Motion');
    expect(result.warnings).toContain('Motion requires offlineSourceRaster and onlineSourceRaster for safe conform copy');
  });

  it('refuses Motion copy when raster conversion warnings require review', () => {
    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 2048, height: 858 },
      sourceEffects: normalizeEffectSnapshots([
        {
          displayName: 'Motion',
          properties: [
            { displayName: 'Scale', value: 100, keyframesIncluded: true },
            { displayName: 'Position', value: { x: 960, y: 540 }, keyframesIncluded: true },
          ],
        },
        {
          displayName: 'Opacity',
          properties: [
            { displayName: 'Opacity', value: 75, keyframesIncluded: true },
          ],
        },
      ]),
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.assignments).toEqual([{ componentName: 'Opacity', propertyName: 'Opacity', value: 75 }]);
    expect(result.unsupportedComponents).toContain('Motion');
    expect(result.warnings).toEqual(expect.arrayContaining([
      'sourceAspectRatioMismatch',
      'nonUniformRasterScaleRequiresReview',
      'unknownMotionPositionCoordinateSpace',
      'Motion raster conversion requires review; static Motion copy refused',
    ]));
  });

  it('refuses animated/keyframed source snapshots instead of flattening them to static values', () => {
    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      sourceEffects: [
        {
          componentName: 'Motion',
          properties: { Scale: 100 },
          keyframedProperties: ['Scale'],
        },
      ],
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.assignments).toEqual([]);
    expect(result.unsupportedComponents).toEqual(['Motion']);
    expect(result.warnings).toContain('Motion has animated/keyframed properties; static copy refused');
  });

  it('refuses Motion copy when snapshot Position vectors have unknown coordinate space', () => {
    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 3840, height: 2160 },
      sourceEffects: normalizeEffectSnapshots([
        {
          displayName: 'Motion',
          properties: [
            { displayName: 'Position', value: [960, 540], keyframesIncluded: true },
            { displayName: 'Anchor Point', value: [960, 540], keyframesIncluded: true },
          ],
        },
        {
          displayName: 'Opacity',
          properties: [
            { displayName: 'Opacity', value: 75, keyframesIncluded: true },
          ],
        },
      ]),
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.assignments).toEqual([{ componentName: 'Opacity', propertyName: 'Opacity', value: 75 }]);
    expect(result.unsupportedComponents).toContain('Motion');
    expect(result.warnings).toEqual(expect.arrayContaining([
      'unknownMotionPositionCoordinateSpace',
      'Motion raster conversion requires review; static Motion copy refused',
    ]));
  });

  it('refuses default snapshots where keyframe discovery was not included', () => {
    const [snapshot] = normalizeEffectSnapshots([
      {
        displayName: 'Motion',
        properties: [
          { displayName: 'Scale', value: 100, keyframesIncluded: false },
        ],
      },
    ]);

    const result = buildEffectCopyPlan({
      sourceClipId: 'offline-1',
      targetClipId: 'online-1',
      sourceEffects: [snapshot!],
      offlineSourceRaster: { width: 1920, height: 1080 },
      onlineSourceRaster: { width: 3840, height: 2160 },
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.assignments).toEqual([]);
    expect(result.unsupportedComponents).toContain('Motion');
    expect(result.warnings.join(' ')).toContain('keyframe state was not inspected');
  });
});
