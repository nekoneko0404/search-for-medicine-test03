import json
import os

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'medicine_data.csv')
JSON_PATH = os.path.join(BASE_DIR, 'category_data.json')

def process_data():
    data_list = []
    
    try:
        # File is UTF-8 as confirmed by byte analysis
        with open(CSV_PATH, mode='r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.strip().split('\n')
            
        header = lines[0].split(',')
        # Expecting: 内注外,薬効,分類名,成分名,R7年度カテゴリ分類案
        
        for i in range(1, len(lines)):
            line = lines[i].strip()
            if not line:
                continue
            cols = line.split(',')
            if len(cols) < 5:
                continue
                
            route = cols[0].strip()
            drug_code = cols[1].strip()
            drug_name = cols[2].strip()
            ingredient = cols[3].strip()
            category = cols[4].strip()

            if not ingredient:
                continue

            item = {
                "ingredient_name": ingredient,
                "category": category,
                "drug_class_code": drug_code,
                "drug_class_name": drug_name,
                "route": route
            }
            
            data_list.append(item)

        # Write to JSON with UTF-8
        with open(JSON_PATH, mode='w', encoding='utf-8') as jsonfile:
            json.dump(data_list, jsonfile, ensure_ascii=False)
            
        print(f"Successfully processed {len(data_list)} items.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process_data()
