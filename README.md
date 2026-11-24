# 三国·将星录（单机版）

三国题材卡牌回合制对战游戏。200 名武将、属性/天赋/羁绊体系，支持闯关、爬塔、试炼、世界 Boss、无尽生存等玩法。

战斗结算在 Python 后端完成，前端为零构建的静态页面（HTML/CSS/JS），由 `server.py` 统一提供页面、接口和图片资源。

## 本地运行

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
PORT=8790 .venv/bin/python app/server.py
```

浏览器打开 <http://localhost:8790>。Windows 下可直接双击 `app/` 里的启动脚本自行配置。

## 部署

仓库自带 `render.yaml`，在 [Render](https://render.com) 新建 Web Service 并连接本仓库即可自动部署：

- 构建：`pip install -r requirements.txt`
- 启动：`python app/server.py`（读取 `PORT` 环境变量）
- 免费实例闲置 15 分钟休眠，再次访问需要约 30–60 秒冷启动

可选：设置环境变量 `SG_TOKEN` 后，访问需带 `?token=你的口令`，用于限制访问人数。

## 目录

```
app/                  游戏服务端、前端页面与素材（img、cache、web）
美术素材/UI素材/       界面用到的纹样与图标
美术素材/模板/         卡牌框模板
requirements.txt
render.yaml
```

## 说明

游戏进度保存在浏览器 localStorage，换设备或清缓存会重置。
