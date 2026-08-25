/**
 * Pointing the bridge at a project other than the frontmost one.
 *
 * Premiere's `app.project` is always whichever project is in front, so every
 * generated script used to follow the operator's focus. Switching projects
 * mid-session silently moved the target: ID-scoped calls failed with "not found",
 * but ID-less ones — create_bin, create_sequence, import_media — would have
 * succeeded inside the wrong project.
 *
 * The fix rewrites `app.project` to a resolver that looks the target up in
 * `app.projects`. These tests hold the three properties that make that safe:
 * unpinned behaviour is byte-identical to before, the collection lookup inside
 * the resolver survives its own rewrite, and the two APIs that cannot be
 * retargeted are guarded rather than silently pointed at the wrong project.
 */

import { PremiereProBridge } from '../../bridge/index.js';

const TARGET = 'J:\\Bear\\Projects\\Bear_Cannabiz.prproj';

/** Everything after the injected preamble, i.e. the caller's own script. */
function scriptBody(built: string): string {
  const marker = 'function __mcpRequireFrontmostTarget(feature) {';
  const at = built.indexOf(marker);
  if (at === -1) return built;
  const after = built.slice(at + marker.length);
  return after.slice(after.indexOf('\n}') + 2);
}

/** A guard *call*, as opposed to the guard definition that is always present. */
const GUARD_CALL = /\n__mcpRequireFrontmostTarget\("/;

describe('bridge project targeting', () => {
  let bridge: PremiereProBridge;
  const build = (script: string, callerAuthored = false): string =>
    (bridge as unknown as {
      buildExecutableScript(s: string, c: boolean): string;
    }).buildExecutableScript(script, callerAuthored);

  beforeEach(() => {
    bridge = new PremiereProBridge();
  });

  describe('when no target is set', () => {
    it('leaves app.project alone and injects nothing', () => {
      const built = build('var n = app.project.name; return n;');
      expect(built).toContain('app.project.name');
      expect(built).not.toContain('__mcpProject');
    });

    it('reports no target', () => {
      expect(bridge.getTargetProject()).toBeNull();
    });
  });

  describe('when a target is set', () => {
    beforeEach(() => {
      bridge.setTargetProject(TARGET, 'Bear_Cannabiz.prproj');
    });

    it('reports the target back', () => {
      expect(bridge.getTargetProject()).toEqual({
        path: TARGET,
        name: 'Bear_Cannabiz.prproj',
      });
    });

    it('rewrites every app.project in the generated script', () => {
      const built = build(
        'var n = app.project.name; var s = app.project.sequences.numSequences; return n + s;'
      );
      expect(built).toContain('__mcpProject().name');
      expect(built).toContain('__mcpProject().sequences.numSequences');
      expect(scriptBody(built)).not.toMatch(/\bapp\.project\b/);
    });

    it('embeds the target and defines the resolver', () => {
      const built = build('return app.project.name;');
      expect(built).toContain('function __mcpProject()');
      expect(built).toContain('Bear_Cannabiz.prproj');
    });

    // The rewrite is anchored on a word boundary, so `app.projects` cannot match.
    // If it ever did, the resolver would recurse into itself and every call would
    // fail with a stack overflow rather than a clear error.
    it('does not rewrite the app.projects collection inside the resolver', () => {
      const built = build('return app.project.name;');
      expect(built).toContain('app.projects.numProjects');
      expect(built).toContain('app.projects[i]');
      expect(built).toContain('return app.project;');
    });

    it('guards the QE DOM, which always follows the frontmost project', () => {
      const built = build('var s = qe.project.getActiveSequence(); return s.name;');
      expect(built).toMatch(GUARD_CALL);
      expect(built).toContain('QE DOM');
    });

    // activeSequence is global, not per-project: a project holding no sequences at
    // all still reports the frontmost project's active sequence, so a tool trusting
    // it would read from the wrong project without erroring.
    it('guards activeSequence', () => {
      const built = build('var s = app.project.activeSequence; return s.name;');
      expect(built).toMatch(GUARD_CALL);
      expect(built).toContain('global rather than per project');
    });

    it('does not guard scripts that touch neither', () => {
      const built = build('var n = app.project.name; return n;');
      expect(built).not.toMatch(GUARD_CALL);
    });

    // execute_extendscript is a passthrough. Rewriting it would edit code the
    // caller wrote by hand, so it keeps its own app.project and can opt in by
    // calling the resolver directly.
    it('never rewrites caller-authored scripts', () => {
      const built = build('var n = app.project.name; return n;', true);
      expect(built).toContain('app.project.name');
      expect(built).toContain('function __mcpProject()');
    });
  });

  describe('clearing the target', () => {
    it('restores the original behaviour exactly', () => {
      bridge.setTargetProject(TARGET, 'Bear_Cannabiz.prproj');
      bridge.setTargetProject(null, null);

      expect(bridge.getTargetProject()).toBeNull();
      const built = build('var n = app.project.name; return n;');
      expect(built).toContain('app.project.name');
      expect(built).not.toContain('__mcpProject');
    });
  });
});
