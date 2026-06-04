export interface RasterDimensions {
  width: number;
  height: number;
}

export interface MotionPosition {
  x: number;
  y: number;
  coordinateSpace?: 'sequencePixels' | 'sourcePixels' | 'normalized' | 'unknown';
}

export interface MotionTransform {
  scale?: number;
  scaleWidth?: number;
  position?: MotionPosition;
  rotation?: number;
  anchorPoint?: MotionPosition;
  opacity?: number;
  [key: string]: unknown;
}

export interface AdaptMotionTransformArgs {
  transform: MotionTransform;
  offlineSourceRaster?: RasterDimensions;
  onlineSourceRaster?: RasterDimensions;
}

export interface AdaptMotionTransformResult {
  transform: MotionTransform;
  warnings: string[];
}

export interface EffectSnapshot {
  componentName: string;
  matchName?: string;
  properties: Record<string, unknown>;
  keyframedProperties?: string[];
  unknownKeyframeProperties?: string[];
}

export interface EffectAssignment {
  componentName: string;
  propertyName: string;
  value: unknown;
}

export interface BuildEffectCopyPlanArgs {
  sourceClipId: string;
  targetClipId: string;
  sourceEffects: EffectSnapshot[];
  offlineSourceRaster?: RasterDimensions;
  onlineSourceRaster?: RasterDimensions;
  supportedComponents?: string[];
}

export interface EffectCopyPlan {
  sourceClipId: string;
  targetClipId: string;
  safeToExecute: boolean;
  assignments: EffectAssignment[];
  unsupportedComponents: string[];
  warnings: string[];
}

const DEFAULT_SUPPORTED_COMPONENTS = ['Motion', 'Opacity', 'Crop'];

function isPositiveRaster(raster?: RasterDimensions): raster is RasterDimensions {
  return Boolean(raster && Number.isFinite(raster.width) && Number.isFinite(raster.height) && raster.width > 0 && raster.height > 0);
}

function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}

function aspectRatio(raster: RasterDimensions): number {
  return raster.width / raster.height;
}

function isMotionPosition(value: unknown): value is MotionPosition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MotionPosition>;
  return typeof candidate.x === 'number' && Number.isFinite(candidate.x) && typeof candidate.y === 'number' && Number.isFinite(candidate.y);
}

function convertSourcePixelPosition(value: unknown, widthRatio: number, heightRatio: number, warnings: string[]): unknown {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && Number.isFinite(value[0]) && typeof value[1] === 'number' && Number.isFinite(value[1])) {
    warnings.push('unknownMotionPositionCoordinateSpace');
    return value;
  }

  if (!isMotionPosition(value)) {
    return value;
  }

  if (value.coordinateSpace === 'sourcePixels') {
    return {
      ...value,
      x: roundNumber(value.x / widthRatio),
      y: roundNumber(value.y / heightRatio),
    };
  }

  if (!value.coordinateSpace || value.coordinateSpace === 'unknown') {
    warnings.push('unknownMotionPositionCoordinateSpace');
  }

  return value;
}

export function adaptMotionTransformForResolution(args: AdaptMotionTransformArgs): AdaptMotionTransformResult {
  const transform: MotionTransform = { ...args.transform };
  const warnings: string[] = [];

  if (!isPositiveRaster(args.offlineSourceRaster) || !isPositiveRaster(args.onlineSourceRaster)) {
    warnings.push('missingSourceRasterForMotionConversion');
    return { transform, warnings };
  }

  const widthRatio = args.offlineSourceRaster.width / args.onlineSourceRaster.width;
  const heightRatio = args.offlineSourceRaster.height / args.onlineSourceRaster.height;
  if (Math.abs(aspectRatio(args.offlineSourceRaster) - aspectRatio(args.onlineSourceRaster)) > 0.001) {
    warnings.push('sourceAspectRatioMismatch');
  }

  if (typeof transform.scale === 'number') {
    transform.scale = roundNumber(transform.scale * widthRatio);
  }
  if (typeof transform.scaleWidth === 'number') {
    transform.scaleWidth = roundNumber(transform.scaleWidth * widthRatio);
  }
  if (typeof transform.Scale === 'number') {
    transform.Scale = roundNumber(transform.Scale * widthRatio);
  }
  if (typeof transform['Scale Width'] === 'number') {
    transform['Scale Width'] = roundNumber(transform['Scale Width'] * widthRatio);
  }

  if (Math.abs(widthRatio - heightRatio) > 0.001 && (typeof transform.scale === 'number' || typeof transform.Scale === 'number')) {
    warnings.push('nonUniformRasterScaleRequiresReview');
  }

  const convertedPosition = convertSourcePixelPosition(transform.position, widthRatio, heightRatio, warnings);
  if (convertedPosition !== undefined) transform.position = convertedPosition as MotionPosition;
  transform.Position = convertSourcePixelPosition(transform.Position, widthRatio, heightRatio, warnings);
  const convertedAnchorPoint = convertSourcePixelPosition(transform.anchorPoint, widthRatio, heightRatio, warnings);
  if (convertedAnchorPoint !== undefined) transform.anchorPoint = convertedAnchorPoint as MotionPosition;
  transform['Anchor Point'] = convertSourcePixelPosition(transform['Anchor Point'], widthRatio, heightRatio, warnings);

  return { transform, warnings };
}

function propertyNameFromSnapshot(property: unknown): string | null {
  if (!property || typeof property !== 'object') return null;
  const candidate = property as { displayName?: unknown; matchName?: unknown; name?: unknown };
  const name = candidate.displayName ?? candidate.name ?? candidate.matchName;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

function propertyValueFromSnapshot(property: unknown): unknown {
  if (!property || typeof property !== 'object') return undefined;
  const candidate = property as { value?: unknown };
  return candidate.value;
}

function propertyHasKeyframes(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const candidate = property as { keyframed?: unknown; isTimeVarying?: unknown; keyframeCount?: unknown; keyframes?: unknown };
  return candidate.keyframed === true
    || candidate.isTimeVarying === true
    || (typeof candidate.keyframeCount === 'number' && candidate.keyframeCount > 0)
    || (Array.isArray(candidate.keyframes) && candidate.keyframes.length > 0);
}

function propertyKeyframeStateUnknown(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const candidate = property as { keyframesIncluded?: unknown };
  return candidate.keyframesIncluded === false;
}

export function normalizeEffectSnapshots(rawEffects: unknown): EffectSnapshot[] {
  if (!Array.isArray(rawEffects)) return [];

  return rawEffects.flatMap((rawEffect) => {
    if (!rawEffect || typeof rawEffect !== 'object') return [];
    const effect = rawEffect as {
      componentName?: unknown;
      displayName?: unknown;
      matchName?: unknown;
      properties?: unknown;
      keyframedProperties?: unknown;
    };
    const componentName = effect.componentName ?? effect.displayName ?? effect.matchName;
    if (typeof componentName !== 'string' || componentName.length === 0) return [];

    const properties: Record<string, unknown> = {};
    const keyframedProperties = new Set<string>();
    const unknownKeyframeProperties = new Set<string>();
    if (Array.isArray(effect.keyframedProperties)) {
      for (const property of effect.keyframedProperties) {
        if (typeof property === 'string' && property.length > 0) keyframedProperties.add(property);
      }
    }
    if (Array.isArray(effect.properties)) {
      for (const property of effect.properties) {
        const propertyName = propertyNameFromSnapshot(property);
        if (propertyName) properties[propertyName] = propertyValueFromSnapshot(property);
        if (propertyName && propertyHasKeyframes(property)) keyframedProperties.add(propertyName);
        if (propertyName && propertyKeyframeStateUnknown(property)) unknownKeyframeProperties.add(propertyName);
      }
    } else if (effect.properties && typeof effect.properties === 'object') {
      for (const [propertyName, value] of Object.entries(effect.properties as Record<string, unknown>)) {
        properties[propertyName] = value;
        unknownKeyframeProperties.add(propertyName);
      }
    }

    const snapshot: EffectSnapshot = {
      componentName,
      properties,
    };
    if (typeof effect.matchName === 'string' && effect.matchName.length > 0) {
      snapshot.matchName = effect.matchName;
    }
    if (keyframedProperties.size > 0) {
      snapshot.keyframedProperties = [...keyframedProperties];
    }
    if (unknownKeyframeProperties.size > 0) {
      snapshot.unknownKeyframeProperties = [...unknownKeyframeProperties];
    }
    return [snapshot];
  });
}

function normalizedComponentName(componentName: string): string {
  return componentName.trim().toLowerCase();
}

function isSupportedComponent(componentName: string, supportedComponents: string[]): boolean {
  const normalized = normalizedComponentName(componentName);
  return supportedComponents.some((component) => normalizedComponentName(component) === normalized);
}

function convertMotionProperty(
  propertyName: string,
  value: unknown,
  args: Pick<BuildEffectCopyPlanArgs, 'offlineSourceRaster' | 'onlineSourceRaster'>,
  warnings: string[]
): unknown {
  const transform: MotionTransform = { [propertyName]: value };
  const converted = adaptMotionTransformForResolution({
    transform,
    ...(args.offlineSourceRaster ? { offlineSourceRaster: args.offlineSourceRaster } : {}),
    ...(args.onlineSourceRaster ? { onlineSourceRaster: args.onlineSourceRaster } : {}),
  });
  warnings.push(...converted.warnings);
  return converted.transform[propertyName];
}

export function buildEffectCopyPlan(args: BuildEffectCopyPlanArgs): EffectCopyPlan {
  const supportedComponents = args.supportedComponents || DEFAULT_SUPPORTED_COMPONENTS;
  const assignments: EffectAssignment[] = [];
  const unsupportedComponents: string[] = [];
  const warnings: string[] = [];

  for (const effect of args.sourceEffects) {
    if (!isSupportedComponent(effect.componentName, supportedComponents)) {
      unsupportedComponents.push(effect.componentName);
      continue;
    }

    if (effect.keyframedProperties && effect.keyframedProperties.length > 0) {
      unsupportedComponents.push(effect.componentName);
      warnings.push(`${effect.componentName} has animated/keyframed properties; static copy refused`);
      continue;
    }

    if (effect.unknownKeyframeProperties && effect.unknownKeyframeProperties.length > 0) {
      unsupportedComponents.push(effect.componentName);
      warnings.push(`${effect.componentName} keyframe state was not inspected; static copy refused`);
      continue;
    }

    const isMotionComponent = normalizedComponentName(effect.componentName) === 'motion';
    if (isMotionComponent && (!isPositiveRaster(args.offlineSourceRaster) || !isPositiveRaster(args.onlineSourceRaster))) {
      unsupportedComponents.push(effect.componentName);
      warnings.push('Motion requires offlineSourceRaster and onlineSourceRaster for safe conform copy');
      continue;
    }

    const componentAssignments: EffectAssignment[] = [];
    const conversionWarnings: string[] = [];
    for (const [propertyName, rawValue] of Object.entries(effect.properties || {})) {
      const propertyWarnings: string[] = [];
      const value = isMotionComponent
        ? convertMotionProperty(propertyName, rawValue, args, propertyWarnings)
        : rawValue;
      if (isMotionComponent) conversionWarnings.push(...propertyWarnings);
      componentAssignments.push({
        componentName: effect.componentName,
        propertyName,
        value,
      });
    }

    if (isMotionComponent && conversionWarnings.length > 0) {
      unsupportedComponents.push(effect.componentName);
      warnings.push(...conversionWarnings);
      warnings.push('Motion raster conversion requires review; static Motion copy refused');
      continue;
    }

    assignments.push(...componentAssignments);
  }

  return {
    sourceClipId: args.sourceClipId,
    targetClipId: args.targetClipId,
    safeToExecute: assignments.length > 0,
    assignments,
    unsupportedComponents: [...new Set(unsupportedComponents)],
    warnings: [...new Set(warnings)],
  };
}
