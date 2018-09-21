export interface IJsonStatus<T, E> {
  data?: T
  errorData?: E
  networkError?: networkError
  statusCode?: number
}
export type networkError = 'timeout' | 'other'
export type httpType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface IExtraHeader {
  key: string
  value: string
}

export interface IRequestBasicParams<B = any> {
  body?: B
  extraHeaders?: IExtraHeader[]
  method?: httpType
  jsonRequest?: boolean
  jsonResponse?: boolean
  url: string
}

export interface IValidStatusCode {
  validStatusCodes?: number[]
  validStatusCodeStart?: number
  validStatusCodeEnd?: number
}

export type IRequestParams<B> = IRequestBasicParams<B> & IValidStatusCode

const defaultRequestParams = {
  method: 'GET',
  jsonRequest: true,
  jsonResponse: true,
  validStatusCodeStart: 200,
  validStatusCodeEnd: 299,
  timeout: 10000,
}

/**
 * Sends a standard request, and handles JSON parsing and response mapping to IJSonStatus
 * If the IJsonStatus data is defined, it means the request was successful.
 * If the networkError is set it means a network error happened.
 * If data is undefined, and networkError is unset, errorData will be defined
 * T is the expected type to be returned on success, E the expected type on errors
 * @param url Full path for request - example: https://github.com/api/test
 * @param method Http method to use (one of httpType)
 * @param body Optional body for POST requests
 * @param extraHeaders Optional extra headers to add
 * @param nonJsonRequest Optional boolean whether this is not a boolean request. Defaults to JSON - set this to true to omit json headers
 * @param validStatusCodes Optional array of HTTP status codes to consider success. Default is 200 - 299
 * @return IJsonStatus object with the parsed data or error
 */
export function requestJson<T, E, B = Object>(
  requestParams: IRequestParams<B>,
): Promise<IJsonStatus<T, E>> {
  const processedParams = { ...defaultRequestParams, ...requestParams }
  const {
    url,
    method,
    body,
    extraHeaders,
    jsonResponse,
    jsonRequest,
    validStatusCodes,
    validStatusCodeStart,
    validStatusCodeEnd,
    timeout,
  } = processedParams
  const statusResponse: IJsonStatus<T, E> = {}
  const headers = new Headers()
  if (jsonRequest) {
    // Add default JSON headers
    headers.append('Content-Type', 'application/json')
  }
  if (jsonResponse) {
    headers.append('Accept', 'application/json')
    // Add default JSON headers
  }
  if (extraHeaders) {
    extraHeaders.map(h => headers.append(h.key, h.value))
  }
  const params: RequestInit = {
    method,
    headers,
  }
  if (
    body &&
    (method === 'POST' || method === 'PATCH' || method === 'DELETE')
  ) {
    params.body = JSON.stringify(body)
  }

  return Promise.race([
    fetch(url, params),
    // this promise will never resolve!
    new Promise((_, reject) =>
      setTimeout(() => {
        const err: networkError = 'timeout'
        reject(err)
      }, timeout),
    ),
  ])
    .then((res: {} | Response) => {
      // response will always be type 'Response'
      const response = res as Response
      statusResponse.statusCode = response.status

      if (jsonResponse) {
        return response.json()
      } else {
        return response
      }
    })
    .then((json: T | E) => {
      // Allow expecting something other than 200s
      const validStatusCode = isValidStatusCode(statusResponse.statusCode!, {
        validStatusCodes,
        validStatusCodeStart,
        validStatusCodeEnd,
      })
      if (validStatusCode) {
        // Success - type is T
        statusResponse.data = json as T
      } else {
        // Error - type is ApiError
        statusResponse.errorData = json as E
      }
      return statusResponse
    })
    .catch((err: E) => {
      if (isNetworkError(err)) {
        statusResponse.networkError = err
      } else {
        statusResponse.errorData = err
      }

      return statusResponse
    })
}

const isNetworkError = (err: any): err is networkError => {
  return err === 'timeout' || err === 'other'
}

const isValidStatusCode = (
  statusCode: number,
  validation: IValidStatusCode,
) => {
  const {
    validStatusCodes,
    validStatusCodeStart,
    validStatusCodeEnd,
  } = validation
  if (validStatusCodes) {
    return validStatusCodes.find(sc => sc === statusCode) !== undefined
  }
  if (validStatusCodeStart && validStatusCodeEnd) {
    return (
      statusCode >= validStatusCodeStart && statusCode <= validStatusCodeEnd
    )
  }
  return false
}
