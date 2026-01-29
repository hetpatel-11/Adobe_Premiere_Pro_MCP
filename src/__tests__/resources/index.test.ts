/**
 * Unit tests for PremiereProResources
 */

import { PremiereProResources } from '../../resources/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

// Mock the bridge
jest.mock('../../bridge/index.js');

describe('PremiereProResources', () => {
  let resources: PremiereProResources;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    resources = new PremiereProResources(mockBridge);
    jest.clearAllMocks();
  });

  describe('getAvailableResources()', () => {
    it('should return array of resources', () => {
      const availableResources = resources.getAvailableResources();

      expect(Array.isArray(availableResources)).toBe(true);
      expect(availableResources.length).toBe(12);
    });

    it('should return all expected resources', () => {
      const availableResources = resources.getAvailableResources();
      const uris = availableResources.map(r => r.uri);

      expect(uris).toContain('premiere://project/info');
      expect(uris).toContain('premiere://project/sequences');
      expect(uris).toContain('premiere://project/media');
      expect(uris).toContain('premiere://project/bins');
      expect(uris).toContain('premiere://timeline/clips');
      expect(uris).toContain('premiere://timeline/tracks');
      expect(uris).toContain('premiere://timeline/markers');
      expect(uris).toContain('premiere://effects/available');
      expect(uris).toContain('premiere://effects/applied');
      expect(uris).toContain('premiere://transitions/available');
      expect(uris).toContain('premiere://export/presets');
      expect(uris).toContain('premiere://project/metadata');
    });

    it('should have valid resource structure', () => {
      const availableResources = resources.getAvailableResources();

      availableResources.forEach(resource => {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
        expect(resource).toHaveProperty('mimeType');
        expect(typeof resource.uri).toBe('string');
        expect(typeof resource.name).toBe('string');
        expect(typeof resource.description).toBe('string');
        expect(resource.mimeType).toBe('application/json');
      });
    });
  });

  describe('readResource()', () => {
    it('should throw error for unknown resource', async () => {
      await expect(resources.readResource('premiere://unknown/resource'))
        .rejects.toThrow("Resource 'premiere://unknown/resource' not found");
    });

    describe('premiere://project/info', () => {
      it('should return project information', async () => {
        const mockData = {
          id: 'proj-123',
          name: 'Test Project',
          path: '/path/to/project.prproj',
          isModified: false,
          settings: {
            scratchDiskPath: '/tmp',
            captureFormat: 'DV',
            previewFormat: 'H.264'
          },
          statistics: {
            sequenceCount: 3,
            projectItemCount: 15
          }
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://project/info');

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://project/sequences', () => {
      it('should return list of sequences', async () => {
        const mockData = {
          sequences: [
            {
              id: 'seq-1',
              name: 'Sequence 01',
              frameRate: 29.97,
              duration: 120.5,
              videoTracks: 3,
              audioTracks: 2
            }
          ],
          totalCount: 1
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://project/sequences');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://project/media', () => {
      it('should return list of media items', async () => {
        const mockData = {
          mediaItems: [
            {
              id: 'item-1',
              name: 'video.mp4',
              type: 'footage',
              mediaPath: '/path/to/video.mp4',
              duration: 10.5,
              hasVideo: true,
              hasAudio: true
            }
          ],
          totalCount: 1
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://project/media');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://project/bins', () => {
      it('should return bin structure', async () => {
        const mockData = {
          bins: [
            {
              id: 'bin-1',
              name: 'Raw Footage',
              depth: 0,
              itemCount: 5
            },
            {
              id: 'bin-2',
              name: 'Music',
              depth: 0,
              itemCount: 3
            }
          ],
          totalCount: 2
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://project/bins');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://timeline/clips', () => {
      it('should return timeline clips', async () => {
        const mockData = {
          clips: [
            {
              id: 'clip-1',
              name: 'video.mp4',
              trackType: 'video',
              trackIndex: 0,
              startTime: 0,
              endTime: 10,
              duration: 10
            }
          ],
          totalCount: 1,
          activeSequence: 'Main Sequence'
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://timeline/clips');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://timeline/tracks', () => {
      it('should return track information', async () => {
        const mockData = {
          tracks: [
            {
              id: 'track-1',
              name: 'Video 1',
              type: 'video',
              index: 0,
              enabled: true,
              locked: false,
              muted: false,
              clipCount: 5
            }
          ],
          totalCount: 1,
          activeSequence: 'Main Sequence'
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://timeline/tracks');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://timeline/markers', () => {
      it('should return timeline markers', async () => {
        const mockData = {
          markers: [
            {
              id: 'marker-1',
              name: 'Chapter 1',
              comment: 'Start of first chapter',
              startTime: 0,
              endTime: 30,
              duration: 30,
              type: 'comment',
              color: 'green'
            }
          ],
          totalCount: 1,
          activeSequence: 'Main Sequence'
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://timeline/markers');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://effects/available', () => {
      it('should return available effects', async () => {
        const mockData = {
          effects: [
            {
              name: 'Gaussian Blur',
              matchName: 'GaussianBlur',
              category: 'Blur & Sharpen',
              type: 'video'
            },
            {
              name: 'Volume',
              matchName: 'Volume',
              category: 'Audio Effects',
              type: 'audio'
            }
          ],
          totalCount: 2
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://effects/available');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://effects/applied', () => {
      it('should return applied effects', async () => {
        const mockData = {
          appliedEffects: [
            {
              clipId: 'clip-1',
              clipName: 'video.mp4',
              effectName: 'Gaussian Blur',
              effectMatchName: 'GaussianBlur',
              trackType: 'video',
              trackIndex: 0,
              enabled: true
            }
          ],
          totalCount: 1
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://effects/applied');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://transitions/available', () => {
      it('should return available transitions', async () => {
        const mockData = {
          transitions: [
            {
              name: 'Cross Dissolve',
              matchName: 'CrossDissolve',
              category: 'Dissolve',
              type: 'video'
            },
            {
              name: 'Constant Power',
              matchName: 'ConstantPower',
              category: 'Crossfade',
              type: 'audio'
            }
          ],
          totalCount: 2
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://transitions/available');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://export/presets', () => {
      it('should return export presets', async () => {
        const mockData = {
          presets: [
            {
              name: 'H.264 - Match Source',
              matchName: 'H264_MatchSource',
              category: 'H.264',
              description: 'Match source settings',
              fileExtension: '.mp4'
            }
          ],
          totalCount: 1
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://export/presets');

        expect(result).toEqual(mockData);
      });
    });

    describe('premiere://project/metadata', () => {
      it('should return project metadata', async () => {
        const mockData = {
          project: {
            name: 'Test Project',
            path: '/path/to/project.prproj',
            creationTime: '2024-01-01T00:00:00Z',
            modificationTime: '2024-01-15T12:00:00Z'
          },
          sequence: {
            name: 'Main Sequence',
            duration: 120,
            frameRate: 29.97,
            settings: {
              frameSize: {
                width: 1920,
                height: 1080
              },
              pixelAspectRatio: 1.0,
              fieldType: 'progressive'
            }
          },
          statistics: {
            totalClips: 15,
            totalEffects: 8,
            totalTransitions: 3
          }
        };

        mockBridge.executeScript.mockResolvedValue(mockData);

        const result = await resources.readResource('premiere://project/metadata');

        expect(result).toEqual(mockData);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle script execution errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Script failed'));

      await expect(resources.readResource('premiere://project/info'))
        .rejects.toThrow('Script failed');
    });

    it('should handle invalid URIs gracefully', async () => {
      await expect(resources.readResource('invalid-uri'))
        .rejects.toThrow('not found');
    });
  });
});
