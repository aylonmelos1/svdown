import axios from 'axios';
import { PinterestService } from '../pinterestService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PinterestService', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('recognizes pin.it URLs as Pinterest links', () => {
        const service = new PinterestService();
        expect(service.isApplicable('https://pin.it/example')).toBe(true);
    });

    it('normalizes short URLs before scraping', async () => {
        const service = new PinterestService();
        const shortUrl = 'https://pin.it/3tSjsaISv';
        const canonicalUrl = 'https://www.pinterest.com/pin/123456/';

        mockedAxios.get.mockResolvedValueOnce({
            data: '',
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { url: shortUrl },
            request: { res: { responseUrl: canonicalUrl } },
        } as any);

        mockedAxios.get.mockResolvedValueOnce({
            data: `
                <html>
                    <body>
                        <h1>Sample Pin</h1>
                        <div class="image-container"><img src="https://img.example.com/pin.jpg" /></div>
                        <table>
                            <tbody>
                                <tr>
                                    <td class="video-quality">720p</td>
                                    <td>MP4</td>
                                    <td>
                                        <a href="https://www.savepin.app/redirect?url=https%3A%2F%2Fcdn.example.com%2Ffile.mp4"></a>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </body>
                </html>
            `,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { url: 'https://www.savepin.app/download.php' },
        } as any);

        const result = await service.resolve(shortUrl);

        expect(mockedAxios.get).toHaveBeenNthCalledWith(
            1,
            shortUrl,
            expect.objectContaining({ maxRedirects: 5 })
        );
        expect(mockedAxios.get).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(encodeURIComponent(canonicalUrl)),
            expect.objectContaining({
                headers: expect.objectContaining({ accept: expect.any(String) }),
            })
        );
        expect(result.service).toBe('pinterest');
        expect(result.video?.url).toBe('https://cdn.example.com/file.mp4');
    });
});
