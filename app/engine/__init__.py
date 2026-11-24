# -*- coding: utf-8 -*-
"""《三国·将星录》战斗引擎公共入口。
游戏客户端/分析脚本统一从这里取 Battle/Unit/simulate，避免直接依赖内部实现。
"""
from .core import (
    Battle, Unit, parse_effect, load_data, simulate,
    run_1v1, run_5v5, run_swapin, unit_coverage, coverage,
    LEVEL, BT, AW, EQUIP, SIX, MAX_ROUNDS,
)
