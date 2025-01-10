/**
 * Template literal tag that normalizes indentation in multi-line strings.
 * Removes leading/trailing empty lines and normalizes indentation based on the first non-empty line.
 * 
 * @example
 * const text = indentNicely`
 *     This text will have
 *     consistent indentation
 *         even with nested levels
 * `
 */
export function indentNicely(strings: TemplateStringsArray, ...values: any[]): string {
    // Combine the template literal parts
    let result = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] || '');
    }, '');

    // Split into lines and remove empty lines at start/end
    let lines = result.split('\n');
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    if (lines.length === 0) return '';

    // Find the minimum indentation level (excluding empty lines)
    const minIndent = lines
        .filter(line => line.trim().length > 0)
        .reduce((min, line) => {
            const indent = line.match(/^\s*/)![0].length;
            return Math.min(min, indent);
        }, Infinity);

    // Remove the common indentation from all lines
    return lines
        .map(line => line.slice(minIndent))
        .join('\n');
} 