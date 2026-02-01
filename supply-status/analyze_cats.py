import json
from collections import Counter

file_path = r'c:\Users\kiyoshi\Github_repository\search-for-medicine\supply-status\data\category_data.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Grouping by ingredient_name
ing_map = {}
for item in data:
    name = item['ingredient_name']
    cat = item['category']
    if name not in ing_map:
        ing_map[name] = []
    ing_map[name].append(cat)

# Analysis
a_count_total = 0
for item in data:
    if item['category'] == 'A':
        a_count_total += 1

unique_ingredients_a = 0
overwritten_a = []
for name, cats in ing_map.items():
    if 'A' in cats:
        unique_ingredients_a += 1
        # If the last category is not A, it gets overwritten in the JS Map
        if cats[-1] != 'A':
            overwritten_a.append((name, cats))

print(f"Total Category A entries in JSON: {a_count_total}")
print(f"Unique ingredients that have Category A: {unique_ingredients_a}")
print(f"Ingredients where A is overwritten by another category (last wins): {len(overwritten_a)}")
for name, cats in overwritten_a:
    print(f"  - {name}: {cats}")

# Check final counts if last wins
last_cats = [cats[-1] for cats in ing_map.values()]
final_counts = Counter(last_cats)
print(f"Final Category Counts (Last Wins): {final_counts}")
