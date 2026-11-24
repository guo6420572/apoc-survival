#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《三国·将星录》浏览器冒烟测试。

覆盖：加载 200 将 / 700 关 → 新建存档 → 章节秘宝三选一 → 开战并跳过 → 任务页渲染。
用法：
    ~/opt/venv-learn/bin/python tools/smoke_test.py
    ~/opt/venv-learn/bin/python tools/smoke_test.py --url http://localhost:8790 --headed
退出码 0 表示通过；有 JS 报错或断言失败返回 1。
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

ERRORS = []


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('  ok -', msg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:8790')
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--timeout', type=int, default=15000)
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.set_default_timeout(args.timeout)
        page.on('pageerror', lambda e: ERRORS.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: ERRORS.append('CONSOLE: ' + m.text) if m.type == 'error' else None)

        print('加载', args.url)
        page.goto(args.url, wait_until='networkidle')
        check(page.evaluate('S.units.length') == 200, '武将 200')
        check(page.evaluate('S.levels.length') == 700, '关卡 700')

        page.click('#newBtn')
        page.wait_for_timeout(300)
        if page.is_visible('#tutorial'):
            page.click('#tutorialSkip')
        check(page.is_visible('#homeScreen'), '进入主城')

        page.evaluate('triggerChapterClear(10)')
        page.wait_for_timeout(200)
        check(page.is_visible('#chapterRelic'), '章节秘宝弹窗')
        check(page.locator('#chapterSigils .sigil-card').count() == 3, '印记三选一')
        page.locator('#chapterSigils .sigil-card').first.click()
        page.wait_for_timeout(150)
        check(page.evaluate('S.owned.reduce((n,x)=>n+sigilsOf(x).length,0)') >= 1, '印记已绑定')

        page.evaluate("showScreen('quest'); renderQuestScreen('chapter')")
        page.wait_for_timeout(150)
        check(page.locator('#questList .quest-item').count() >= 1, '章节悬赏/印记簿渲染')

        lv = 'S.levels[0]'
        page.evaluate(f"S.mode='level'; S.levelId=1; S.levelData={lv}; "
                      f"S.b={lv}.enemies.map(e=>e.name); S.a={lv}.enemies.map(e=>e.name).slice(0,5)")
        check(page.evaluate('startBattle()') is True, '战斗启动')
        page.evaluate('skipBattle()')
        page.wait_for_selector('#overlay:not([hidden])', timeout=args.timeout)
        check(page.is_visible('#overlay'), '战斗结算')

        browser.close()

    if ERRORS:
        print('\nJS 错误：')
        for e in ERRORS[:10]:
            print(' ', e)
        return 1
    print('\n冒烟通过，0 个 JS 错误')
    return 0


if __name__ == '__main__':
    sys.exit(main())
