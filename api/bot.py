import requests
import re
import random
from datetime import datetime
from typing import Dict, List, Tuple, Optional

# Logic parsing kita pisah supaya rapi
def extract_train_details(card_html: str) -> Dict:
    details = {
        'departure_station': None, 'arrival_station': None,
        'departure_date': None, 'arrival_date': None,
        'departure_time': None, 'arrival_time': None,
        'duration': None, 'class': None
    }
    try:
        # Departure info
        dep_match = re.search(r'<div class="times time-start">(\d{2}:\d{2})</div>\s*<div class="station date-start">(.*?)</div>', card_html, re.DOTALL)
        if dep_match:
            details['departure_time'] = dep_match.group(1)
            details['departure_date'] = dep_match.group(2).strip()
        
        # Arrival info
        arr_match = re.search(r'<div class="times time-end">(\d{2}:\d{2})</div>\s*<div class="station station-end">(.*?)</div>', card_html, re.DOTALL)
        if arr_match:
            details['arrival_time'] = arr_match.group(1)
            details['arrival_date'] = arr_match.group(2).strip()

        # Stations
        dep_sta = re.search(r'<div class=".*?station station-start.*?">([^"]+)<\/div>', card_html)
        arr_sta = re.search(r'<div class=".*?station station-end.*?">([^"]+)<\/div>', card_html)
        if dep_sta: details['departure_station'] = dep_sta.group(1)
        if arr_sta: details['arrival_station'] = arr_sta.group(1)

        # Price
        price_match = re.search(r'<div class="price">(Rp [\d.,]+-)</div>', card_html)
        if price_match: details['price'] = price_match.group(1)
        
        # Duration
        dur_match = re.search(r'<div class=".*?long-time.*?">([^<]+)<\/div>', card_html)
        if dur_match:
            details['duration'] = dur_match.group(1).strip()
        
        # Class
        class_match = re.search(r'<div class=".*?{kelas kereta}.*?">([^<]+)<\/div>', card_html)
        if class_match:
            details['class'] = class_match.group(1).strip()

    except Exception:
        pass
    return details

def check_bengawan_once(url: str) -> Dict:
    """
    Fungsi ini berjalan SEKALI saja.
    Return: Dict berisi logs, status availability, dan data tiket.
    """
    logs = [] # Kita tampung log di sini
    current_time = datetime.now().strftime("%H:%M:%S")
    
    logs.append(f"[{current_time}] Checking status...")

    user_agents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ]
    
    headers = {
        'User-Agent': random.choice(user_agents),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive'
    }

    try:
        # Timeout diperpendek agar Vercel tidak complain
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            logs.append(f"Error: HTTP {response.status_code}")
            return {"success": False, "is_available": False, "logs": logs}

        content = response.text
        # Regex pattern untuk card kereta
        card_pattern = r'<div class="data-block list-kereta".*?</form>\s*</div>'
        cards = re.findall(card_pattern, content, re.DOTALL | re.IGNORECASE)
        
        found_bengawan = False
        
        for card in cards:
            # Cek nama kereta (Simple check)
            if 'BENGAWAN' in card.upper() or 'data-kereta="BENGAWAN"' in card:
                found_bengawan = True
                details = extract_train_details(card)
                
                # Cek Availability Logic
                is_available = False
                status_text = "Sold Out"
                
                # Cek teks sisa kursi
                avail_match = re.search(r'<small class="form-text sisa-kursi">([^<]+)</small>', card)
                avail_raw = avail_match.group(1).strip() if avail_match else ""
                
                if 'tersedia' in avail_raw.lower():
                    is_available = True
                    status_text = "AVAILABLE (Many Seats)"
                elif 'sisa' in avail_raw.lower() and 'kursi' in avail_raw.lower():
                    is_available = True
                    status_text = f"AVAILABLE ({avail_raw})"
                elif 'habis' in avail_raw.lower():
                    is_available = False
                    status_text = "Habis / Sold Out"
                
                # Log logic
                icon = "🟢" if is_available else "🔴"
                logs.append(f"{icon} BENGAWAN: {status_text}")
                
                if is_available:
                    logs.append(f"   Price: {details.get('price', 'N/A')}")
                    logs.append("   GO BOOK NOW!")
                    return {
                        "success": True,
                        "is_available": True,
                        "logs": logs,
                        "data": {
                            "name": "BENGAWAN",
                            "status_text": status_text,
                            **details
                        }
                    }
                else:
                    # Kereta ada, tapi tiket habis
                    return {
                        "success": True,
                        "is_available": False,
                        "logs": logs,
                        "data": {
                            "name": "BENGAWAN",
                            **details
                        }
                    }

        if not found_bengawan:
            logs.append("Train BENGAWAN not found in this page.")
            return {"success": True, "is_available": False, "logs": logs}

    except Exception as e:
        logs.append(f"System Error: {str(e)}")
        return {"success": False, "is_available": False, "logs": logs}
    
    return {"success": False, "is_available": False, "logs": logs}