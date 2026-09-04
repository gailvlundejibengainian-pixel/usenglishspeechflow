#!/usr/bin/env python3
"""
多美迎高松酒店监控工具
监控含早餐套餐的可用性，当出现时发送邮件通知
"""

import requests
from bs4 import BeautifulSoup
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime, timedelta
import time
import json

# 配置
HOTEL_NAME = "多美迎高松"
HOTEL_ID = "238"
ROOM_TYPE_ID = "2050"
TARGET_EMAIL = "gailvlundejibengainian@gmail.com"
GMAIL_USER = os.getenv("GMAIL_USER")  # 需要设置环境变量
GMAIL_PASSWORD = os.getenv("GMAIL_PASSWORD")  # 需要设置环境变量
CHECK_INTERVAL = 3600  # 每小时检查一次（秒）

# 要监控的日期列表
DATES_TO_MONITOR = [
    "2026/09/28",
    "2026/09/29",
    "2026/09/30",
]

BASE_URL = "https://dormy-hotels.com/reserve/select-plan"


def build_url(checkin_date, number_of_adults=2, number_of_rooms=1, number_of_nights=1):
    """构建查询URL"""
    params = {
        "keyword": "多美迎高松",
        "checkin": checkin_date,
        "number_of_nights": number_of_nights,
        "number_of_rooms": number_of_rooms,
        "search_by_tag": "hotel",
        "tags": "",
        "brands": "",
        "stock_check": "true",
        "keyword_reference": "",
        "order_by": "",
        "hotelId": HOTEL_ID,
        "roomTypeId": ROOM_TYPE_ID,
        "planId": "",
        "number_of_adults[]": number_of_adults,
        "number_of_children_need_futons[]": 0,
        "number_of_children_no_need_futons[]": 0,
    }
    
    from urllib.parse import urlencode
    query_string = urlencode(params)
    return f"{BASE_URL}?{query_string}"


def fetch_plans(url):
    """获取页面内容"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.encoding = 'utf-8'
        return response.text
    except Exception as e:
        print(f"获取URL失败: {e}")
        return None


def check_breakfast_plan(html_content):
    """检查是否有含早餐的套餐"""
    if not html_content:
        return False, []
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 查找所有包含价格信息的套餐
    breakfast_plans = []
    
    # 查找包含"朝食付き"（含早餐）的文本
    if "朝食付き" in html_content:
        # 找到所有包含价格的plan-img元素之后的文本
        plan_elements = soup.find_all('div', class_='plan-item')
        
        for element in plan_elements:
            if "朝食付き" in element.get_text():
                # 提取价格信息
                price_elem = element.find('span', class_='price')
                price = price_elem.get_text().strip() if price_elem else "未知"
                breakfast_plans.append({
                    "plan_name": element.get_text(strip=True)[:100],
                    "price": price
                })
    
    return len(breakfast_plans) > 0, breakfast_plans


def send_email(checkin_date, plans):
    """发送邮件通知"""
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print("错误：未设置 GMAIL_USER 或 GMAIL_PASSWORD 环境变量")
        print("请设置: export GMAIL_USER='your-email@gmail.com'")
        print("请设置: export GMAIL_PASSWORD='your-app-password'")
        return False
    
    try:
        # 格式化日期为标题格式
        date_for_title = checkin_date.replace("/", "")
        subject = f"{date_for_title} {HOTEL_NAME}，出现含早套餐。"
        
        # 构建邮件正文
        body = f"""
检测到多美迎高松有含早餐的套餐！

入住日期: {checkin_date}
检查时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

发现的套餐:
"""
        
        for i, plan in enumerate(plans, 1):
            body += f"\n{i}. {plan['plan_name']}\n   价格: {plan['price']}\n"
        
        body += f"\n请访问以下链接查看详情:\n"
        body += build_url(checkin_date) + "\n"
        
        # 创建邮件
        msg = MIMEMultipart()
        msg['From'] = GMAIL_USER
        msg['To'] = TARGET_EMAIL
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # 发送邮件
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.send_message(msg)
        
        print(f"✓ 邮件已发送到 {TARGET_EMAIL}")
        print(f"  主题: {subject}")
        return True
    
    except Exception as e:
        print(f"✗ 发送邮件失败: {e}")
        return False


def log_status(checkin_date, has_breakfast, plans):
    """记录检查状态"""
    status = "✓ 发现含早套餐" if has_breakfast else "✗ 无含早套餐"
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {checkin_date}: {status}")
    if has_breakfast:
        for plan in plans:
            print(f"    - {plan['plan_name']}")


def monitor_once():
    """执行一次监控检查"""
    print(f"\n=== 开始检查 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) ===")
    
    found_breakfast = False
    
    for checkin_date in DATES_TO_MONITOR:
        url = build_url(checkin_date)
        html = fetch_plans(url)
        has_breakfast, plans = check_breakfast_plan(html)
        
        log_status(checkin_date, has_breakfast, plans)
        
        # 如果找到含早套餐，发送邮件
        if has_breakfast:
            send_email(checkin_date, plans)
            found_breakfast = True
    
    print(f"=== 检查完成 ===\n")
    return found_breakfast


def run_continuous_monitor():
    """连续监控模式"""
    print(f"监控工具已启动")
    print(f"目标酒店: {HOTEL_NAME}")
    print(f"监控日期: {', '.join(DATES_TO_MONITOR)}")
    print(f"通知邮箱: {TARGET_EMAIL}")
    print(f"检查间隔: {CHECK_INTERVAL}秒 ({CHECK_INTERVAL//3600}小时)\n")
    
    try:
        while True:
            monitor_once()
            print(f"下次检查时间: {(datetime.now() + timedelta(seconds=CHECK_INTERVAL)).strftime('%Y-%m-%d %H:%M:%S')}")
            time.sleep(CHECK_INTERVAL)
    except KeyboardInterrupt:
        print("\n监控已停止")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        # 仅执行一次
        monitor_once()
    else:
        # 连续监控
        run_continuous_monitor()
