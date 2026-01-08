import os

file_path = r'c:\Users\kiyoshi\Github_repository\search-for-medicine\Okusuri_nometane\style.css'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Fix mobile layout
# Find the line with ".certificate-characters {" inside the media query (around 1553)
target_start_index = -1
for i, line in enumerate(lines):
    if i > 1500 and ".certificate-characters {" in line:
        target_start_index = i
        break

if target_start_index != -1:
    # Check if we are replacing the right thing (flex-direction: column)
    if "column" in lines[target_start_index+1]:
        new_content = [
            "    .certificate-characters {\n",
            "        flex-direction: row;\n",
            "        flex-wrap: nowrap;\n",
            "        gap: 5px;\n",
            "        justify-content: center;\n",
            "    }\n",
            "\n",
            "    .character-signature img {\n",
            "        width: 50px;\n",
            "        height: 50px;\n",
            "    }\n",
            "\n",
            "    .character-signature span {\n",
            "        font-size: 0.8rem;\n",
            "    }\n"
        ]
        # Replace 4 lines (selector, flex-direction, gap, brace)
        lines[target_start_index:target_start_index+4] = new_content
        print("Mobile layout fixed.")
    else:
        print(f"Target content mismatch at line {target_start_index+1}: {lines[target_start_index+1]}")
else:
    print("Could not find .certificate-characters block.")

# 2. Remove duplicates
# Find start of duplicate block: ".certificate-body {" around 1577 (now shifted)
dup_start_index = -1
for i, line in enumerate(lines):
    if i > 1570 and ".certificate-body {" in line:
        dup_start_index = i
        break

# Find end of duplicate block: closing brace of duplicate mobile media query
dup_end_index = -1
if dup_start_index != -1:
    for i, line in enumerate(lines):
        if i > dup_start_index and ".certificate-characters {" in line:
            if i+1 < len(lines) and "column" in lines[i+1]:
                # This is the duplicate mobile block.
                # The block ends at i+3 (closing brace of selector)
                # The media query ends at i+4 (closing brace of media query)
                dup_end_index = i + 4
                break

if dup_start_index != -1 and dup_end_index != -1:
    del lines[dup_start_index:dup_end_index+1]
    print("Duplicates removed.")
else:
    print(f"Could not find duplicates range. Start: {dup_start_index}, End: {dup_end_index}")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
