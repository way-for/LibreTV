// Vercel Serverless Function - 代理请求处理
// 路径: /api/proxy/[...path] → 通过 vercel.json rewrite 映射到 /proxy/*

import crypto from 'crypto';

export default async function handler(req, res) {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        // 验证鉴权
        if (!validateAuth(req)) {
            return res.status(401).json({
                success: false,
                error: '代理访问未授权：请检查密码配置或鉴权参数'
            });
        }

        // 从路径中提取目标 URL
        const pathParts = req.query.path || [];
        const encodedUrl = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
        const targetUrl = decodeURIComponent(encodedUrl);

        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
            return res.status(400).send('无效的目标 URL');
        }

        // 构建请求头
        const requestHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        };

        // 豆瓣图片防盗链
        if (targetUrl.includes('doubanio.com') || targetUrl.includes('douban.com')) {
            requestHeaders['Referer'] = 'https://movie.douban.com/';
        }

        // 请求目标 URL
        const response = await fetch(targetUrl, {
            headers: requestHeaders,
            redirect: 'follow'
        });

        if (!response.ok) {
            return res.status(response.status).send(`目标请求失败: ${response.status}`);
        }

        // 转发响应头
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        // 流式转发响应体
        const buffer = await response.arrayBuffer();
        return res.status(200).send(Buffer.from(buffer));

    } catch (error) {
        console.error('代理请求错误:', error.message);
        return res.status(500).send(`请求失败: ${error.message}`);
    }
}

function validateAuth(req) {
    const authHash = req.query.auth;
    const timestamp = req.query.t;

    const serverPassword = process.env.PASSWORD;
    if (!serverPassword) {
        console.error('未设置 PASSWORD 环境变量');
        return false;
    }

    const serverPasswordHash = crypto.createHash('sha256').update(serverPassword).digest('hex');

    if (!authHash || authHash !== serverPasswordHash) {
        return false;
    }

    // 验证时间戳（10分钟有效期）
    if (timestamp) {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000;
        if (now - parseInt(timestamp) > maxAge) {
            return false;
        }
    }

    return true;
}
