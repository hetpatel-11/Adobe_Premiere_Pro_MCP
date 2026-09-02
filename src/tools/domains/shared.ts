/**
 * Helpers shared by more than one Premiere domain.
 */

export function buildSequenceResolver(sequenceId: string, varName: string = 'sequence'): string {
  const literal = JSON.stringify(sequenceId);
  return `        var ${varName} = __findSequence(${literal});
        if (!${varName}) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found by id: " + ${literal} + ". Use list_sequences or get_active_sequence to obtain a valid sequence ID."
          });
        }`;
}
