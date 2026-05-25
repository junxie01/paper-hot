# PaperHot 阿里云轻量服务器部署

目标访问地址：

```text
http://paper-hot.seis-jun.xyz
```

以下命令假设服务器系统是 Ubuntu，项目目录是 `/opt/paper-hot`。

## 1. 准备项目

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git nginx

cd /opt
sudo git clone https://github.com/junxie01/paper-hot.git
cd /opt/paper-hot

python3 -m venv venv
./venv/bin/pip install --upgrade pip setuptools wheel
./venv/bin/pip install -r requirements.txt
```

如果项目已经存在，只需要更新：

```bash
cd /opt/paper-hot
sudo git pull
./venv/bin/pip install -r requirements.txt
```

## 2. 创建运行用户

```bash
sudo useradd --system --home-dir /opt/paper-hot --shell /usr/sbin/nologin paperhot || true
sudo chown -R paperhot:paperhot /opt/paper-hot
```

## 3. 安装 systemd 服务

```bash
sudo cp /opt/paper-hot/deploy/paper-hot.service /etc/systemd/system/paper-hot.service
sudo systemctl daemon-reload
sudo systemctl enable paper-hot
sudo systemctl start paper-hot
```

检查服务状态：

```bash
sudo systemctl status paper-hot
```

看运行日志：

```bash
sudo journalctl -u paper-hot -f
```

## 4. 安装 Nginx 配置

```bash
sudo cp /opt/paper-hot/deploy/nginx-paper-hot.conf /etc/nginx/sites-available/paper-hot
sudo ln -sf /etc/nginx/sites-available/paper-hot /etc/nginx/sites-enabled/paper-hot
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 阿里云控制台设置

在域名解析里添加：

```text
记录类型：A
主机记录：paper-hot
记录值：轻量服务器公网 IP
```

在轻量服务器防火墙里放行：

```text
TCP 80
TCP 443
```

如果只先测试 HTTP，放行 `80` 即可。

## 6. 验证

```bash
curl -I http://127.0.0.1:8000/paper-hot
curl -I http://paper-hot.seis-jun.xyz
```

浏览器访问：

```text
http://paper-hot.seis-jun.xyz
```

## 常用操作

重启：

```bash
sudo systemctl restart paper-hot
```

停止：

```bash
sudo systemctl stop paper-hot
```

更新代码后重启：

```bash
cd /opt/paper-hot
sudo git pull
sudo chown -R paperhot:paperhot /opt/paper-hot
sudo systemctl restart paper-hot
```
